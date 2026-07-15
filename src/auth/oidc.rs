use arc_swap::ArcSwap;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use openidconnect::{core::CoreProviderMetadata, reqwest::async_http_client, IssuerUrl};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Mutex;

use super::identity::{Identity, IdentityKind};
use crate::domain::settings::OidcConfig;

/// A minimal JWKS key entry we need for RS256/ES256 verification.
#[derive(Debug, Clone, Deserialize)]
struct JwkEntry {
    pub kid: Option<String>,
    pub kty: String,
    pub n: Option<String>,
    pub e: Option<String>,
    // EC keys
    #[allow(dead_code)]
    pub crv: Option<String>,
    pub x: Option<String>,
    pub y: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Jwks {
    keys: Vec<JwkEntry>,
}

#[derive(Debug, Deserialize)]
struct StandardClaims {
    pub sub: String,
    pub email: Option<String>,
    pub name: Option<String>,
}

struct CachedJwks {
    keys: HashMap<String, DecodingKey>,
    /// fallback when kid is absent — first key
    first: Option<DecodingKey>,
}

pub struct OidcValidator {
    issuer_url: String,
    client_id: String,
    /// JWT claim name for groups (default "groups")
    groups_claim: String,
    /// Group that grants full access. None = any authenticated user gets full access.
    full_access_group: Option<String>,
    /// Group that grants api_read scope only.
    readonly_group: Option<String>,
    jwks: ArcSwap<Option<Arc<CachedJwks>>>,
    refresh_lock: Mutex<()>,
}

impl OidcValidator {
    pub fn new(cfg: &OidcConfig) -> Option<Self> {
        if !cfg.enabled {
            return None;
        }
        Some(OidcValidator {
            issuer_url: cfg.issuer_url.clone()?,
            client_id: cfg.client_id.clone()?,
            groups_claim: cfg
                .groups_claim
                .clone()
                .unwrap_or_else(|| "groups".to_string()),
            full_access_group: cfg.full_access_group.clone(),
            readonly_group: cfg.readonly_group.clone(),
            jwks: ArcSwap::new(Arc::new(None)),
            refresh_lock: Mutex::new(()),
        })
    }

    /// Extract group strings from the named claim in a decoded JWT value map.
    fn extract_groups(&self, raw: &serde_json::Value) -> Vec<String> {
        let claim = raw
            .get(&self.groups_claim)
            .unwrap_or(&serde_json::Value::Null);
        match claim {
            serde_json::Value::Array(arr) => arr
                .iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect(),
            serde_json::Value::String(s) => vec![s.clone()],
            _ => vec![],
        }
    }

    /// Resolve scopes from a group list given the configured group mappings.
    fn resolve_scopes(&self, groups: &[String]) -> Result<HashSet<String>, String> {
        match &self.full_access_group {
            None => {
                // No group restriction configured — full access for any authenticated user.
                Ok(HashSet::new()) // empty = full access (OIDC path)
            }
            Some(full_group) => {
                if groups.contains(full_group) {
                    return Ok(HashSet::new()); // full access
                }
                if let Some(ro_group) = &self.readonly_group {
                    if groups.contains(ro_group) {
                        let mut s = HashSet::new();
                        s.insert("api_read".to_string());
                        return Ok(s);
                    }
                }
                Err("user is not a member of any authorised group".to_string())
            }
        }
    }

    async fn load_jwks(&self) -> Result<Arc<CachedJwks>, String> {
        if let Some(cached) = self.jwks.load().as_ref().clone() {
            return Ok(cached);
        }

        let _lock = self.refresh_lock.lock().await;
        if let Some(cached) = self.jwks.load().as_ref().clone() {
            return Ok(cached);
        }

        let issuer = IssuerUrl::new(self.issuer_url.clone())
            .map_err(|e| format!("invalid issuer URL: {e}"))?;

        let metadata = CoreProviderMetadata::discover_async(issuer, async_http_client)
            .await
            .map_err(|e| format!("OIDC discovery failed: {e}"))?;

        let jwks_uri = metadata.jwks_uri().url().as_str();
        let resp = reqwest::get(jwks_uri)
            .await
            .map_err(|e| format!("JWKS fetch failed: {e}"))?;
        let jwks: Jwks = resp
            .json()
            .await
            .map_err(|e| format!("JWKS parse failed: {e}"))?;

        let mut keys: HashMap<String, DecodingKey> = HashMap::new();
        let mut first: Option<DecodingKey> = None;

        for key in &jwks.keys {
            let decoding_key = match key.kty.as_str() {
                "RSA" => {
                    let n = key.n.as_deref().ok_or("missing RSA n")?;
                    let e = key.e.as_deref().ok_or("missing RSA e")?;
                    DecodingKey::from_rsa_components(n, e)
                        .map_err(|e| format!("RSA key error: {e}"))?
                }
                "EC" => {
                    let x = key.x.as_deref().ok_or("missing EC x")?;
                    let y = key.y.as_deref().ok_or("missing EC y")?;
                    DecodingKey::from_ec_components(x, y)
                        .map_err(|e| format!("EC key error: {e}"))?
                }
                _ => continue,
            };
            if first.is_none() {
                first = Some(decoding_key.clone());
            }
            if let Some(kid) = &key.kid {
                keys.insert(kid.clone(), decoding_key);
            }
        }

        let cached = Arc::new(CachedJwks { keys, first });
        self.jwks.store(Arc::new(Some(cached.clone())));
        Ok(cached)
    }

    pub async fn verify(&self, raw_token: &str) -> Result<Identity, String> {
        let jwks = self.load_jwks().await?;

        // Determine which key to use from the token header
        let header = decode_header(raw_token).map_err(|e| format!("JWT header error: {e}"))?;

        let decoding_key = if let Some(kid) = &header.kid {
            // If key not found, drop cache and retry once (handles key rotation)
            if let Some(k) = jwks.keys.get(kid) {
                k.clone()
            } else {
                self.invalidate();
                let jwks2 = self.load_jwks().await?;
                jwks2
                    .keys
                    .get(kid)
                    .or(jwks2.first.as_ref())
                    .ok_or_else(|| format!("no matching JWK for kid={kid}"))?
                    .clone()
            }
        } else {
            jwks.first.as_ref().ok_or("JWKS is empty")?.clone()
        };

        let alg = match header.alg {
            jsonwebtoken::Algorithm::RS256 => Algorithm::RS256,
            jsonwebtoken::Algorithm::RS384 => Algorithm::RS384,
            jsonwebtoken::Algorithm::RS512 => Algorithm::RS512,
            jsonwebtoken::Algorithm::ES256 => Algorithm::ES256,
            jsonwebtoken::Algorithm::ES384 => Algorithm::ES384,
            other => return Err(format!("unsupported algorithm: {other:?}")),
        };

        let mut validation = Validation::new(alg);
        validation.set_audience(&[&self.client_id]);
        validation.set_issuer(&[&self.issuer_url]);

        // Decode into a raw JSON map so we can read the configurable groups claim.
        let raw_data = decode::<serde_json::Value>(raw_token, &decoding_key, &validation)
            .map_err(|e| format!("JWT verification failed: {e}"))?;

        // Also decode typed claims for structured fields.
        let typed: StandardClaims = serde_json::from_value(raw_data.claims.clone())
            .map_err(|e| format!("JWT claims parse failed: {e}"))?;

        let groups = self.extract_groups(&raw_data.claims);

        tracing::debug!(
            sub = %typed.sub,
            groups_claim = %self.groups_claim,
            groups = ?groups,
            full_access_group = ?self.full_access_group,
            readonly_group = ?self.readonly_group,
            raw_claim_value = ?raw_data.claims.get(&self.groups_claim),
            "OIDC token verified — resolving scopes from groups",
        );

        let scopes = self
            .resolve_scopes(&groups)
            .map_err(|e| format!("access denied: {e}"))?;

        tracing::debug!(
            sub = %typed.sub,
            resolved_scopes = ?scopes,
            "OIDC scope resolution complete",
        );

        Ok(Identity {
            subject: typed.sub,
            email: typed.email,
            name: typed.name,
            kind: IdentityKind::Oidc,
            scopes,
            token_created_by: None,
        })
    }

    /// Drop cached JWKS so the next call re-discovers (call after config change).
    pub fn invalidate(&self) {
        self.jwks.store(Arc::new(None));
    }
}
