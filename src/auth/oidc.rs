use arc_swap::ArcSwap;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use openidconnect::{
    core::CoreProviderMetadata, reqwest::async_http_client, IssuerUrl,
};
use serde::Deserialize;
use std::collections::HashMap;
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
            jwks: ArcSwap::new(Arc::new(None)),
            refresh_lock: Mutex::new(()),
        })
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
            jwks.first
                .as_ref()
                .ok_or("JWKS is empty")?
                .clone()
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

        let token_data = decode::<StandardClaims>(raw_token, &decoding_key, &validation)
            .map_err(|e| format!("JWT verification failed: {e}"))?;

        let claims = token_data.claims;
        Ok(Identity {
            subject: claims.sub,
            email: claims.email,
            name: claims.name,
            kind: IdentityKind::Oidc,
        })
    }

    /// Drop cached JWKS so the next call re-discovers (call after config change).
    pub fn invalidate(&self) {
        self.jwks.store(Arc::new(None));
    }
}
