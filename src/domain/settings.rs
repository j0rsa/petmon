use crate::{
    domain::auth::Scope,
    error::{AppError, AppResult},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── OIDC ─────────────────────────────────────────────────────────────────────

/// Stored in app_settings where key = 'oidc'.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcConfig {
    pub enabled: bool,
    /// OIDC issuer URL used for autodiscovery (/.well-known/openid-configuration)
    pub issuer_url: Option<String>,
    pub client_id: Option<String>,
    /// JWT claim name that contains group membership (default: "groups")
    pub groups_claim: Option<String>,
    /// Group value granting full access. If None, any authenticated OIDC user gets full access.
    pub full_access_group: Option<String>,
    /// Group value granting api_read scope only.
    pub readonly_group: Option<String>,
}

/// What GET /settings/oidc returns.
#[derive(Debug, Serialize)]
pub struct OidcConfigPublic {
    pub enabled: bool,
    pub issuer_url: Option<String>,
    pub client_id: Option<String>,
    pub groups_claim: Option<String>,
    pub full_access_group: Option<String>,
    pub readonly_group: Option<String>,
}

impl Default for OidcConfig {
    fn default() -> Self {
        OidcConfig {
            enabled: false,
            issuer_url: None,
            client_id: None,
            groups_claim: Some("groups".to_string()),
            full_access_group: None,
            readonly_group: None,
        }
    }
}

impl From<OidcConfig> for OidcConfigPublic {
    fn from(c: OidcConfig) -> Self {
        OidcConfigPublic {
            enabled: c.enabled,
            issuer_url: c.issuer_url,
            client_id: c.client_id,
            groups_claim: c.groups_claim,
            full_access_group: c.full_access_group,
            readonly_group: c.readonly_group,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateOidcConfig {
    pub enabled: Option<bool>,
    pub issuer_url: Option<String>,
    pub client_id: Option<String>,
    pub groups_claim: Option<String>,
    pub full_access_group: Option<String>,
    pub readonly_group: Option<String>,
}

impl UpdateOidcConfig {
    pub fn apply(self, existing: OidcConfig) -> OidcConfig {
        OidcConfig {
            enabled: self.enabled.unwrap_or(existing.enabled),
            issuer_url: self.issuer_url,
            client_id: self.client_id,
            groups_claim: self.groups_claim,
            full_access_group: self.full_access_group,
            readonly_group: self.readonly_group,
        }
    }
}

// ── Telegram ──────────────────────────────────────────────────────────────────

/// Stored in app_settings where key = 'telegram'.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TelegramConfig {
    pub enabled: bool,
    /// Bot token from @BotFather — stored but never returned via GET
    pub bot_token: Option<String>,
}

/// What GET /settings/telegram returns — no bot_token
#[derive(Debug, Serialize)]
pub struct TelegramConfigPublic {
    pub enabled: bool,
    pub has_bot_token: bool,
}

impl From<TelegramConfig> for TelegramConfigPublic {
    fn from(c: TelegramConfig) -> Self {
        TelegramConfigPublic {
            enabled: c.enabled,
            has_bot_token: c.bot_token.is_some(),
        }
    }
}

/// PATCH body — all fields optional; omitting bot_token keeps the stored value.
#[derive(Debug, Deserialize)]
pub struct UpdateTelegramConfig {
    pub enabled: Option<bool>,
    pub bot_token: Option<String>,
}

impl UpdateTelegramConfig {
    pub fn apply(self, existing: TelegramConfig) -> TelegramConfig {
        TelegramConfig {
            enabled: self.enabled.unwrap_or(existing.enabled),
            bot_token: self
                .bot_token
                .map(|t| {
                    let trimmed = t.trim();
                    trimmed.strip_prefix("bot").unwrap_or(trimmed).to_owned()
                })
                .or(existing.bot_token),
        }
    }
}

// ── Display enums (used by per-user display settings) ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TimeFormat {
    #[default]
    H24,
    H12,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DateFormat {
    /// DD.MM.YYYY
    #[default]
    Dmy,
    /// MMM DD, YYYY
    MmmDdYyyy,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WeekStart {
    #[default]
    Sunday,
    Monday,
}

// ── API tokens ────────────────────────────────────────────────────────────────

/// Decode the legacy CSV storage boundary. Empty retains ordinary full access;
/// unknown values fail closed instead of being dropped into an empty scope set.
pub fn parse_scopes(raw: &str) -> Result<Vec<Scope>, String> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::parse)
        .collect()
}

pub fn scopes_csv(scopes: &[Scope]) -> String {
    scopes
        .iter()
        .map(|scope| scope.as_str())
        .collect::<Vec<_>>()
        .join(",")
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApiToken {
    pub id: String,
    pub alias: Option<String>,
    pub token_hash: String,
    pub active: bool,
    /// Exact database representation, retained for activation's compare-and-swap.
    /// Callers outside the crate consume only validated enums via scopes_vec().
    #[sqlx(rename = "scopes")]
    #[serde(rename = "scopes")]
    pub(crate) scopes_csv: String,
    pub created_by: Option<String>,
    /// OIDC `sub` (or `dev`) of the user who minted this token — the per-user id for settings, reads, and push.
    pub owner_subject: Option<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

/// What the list/get endpoints return — hash never exposed
#[derive(Debug, Serialize)]
pub struct ApiTokenPublic {
    pub id: String,
    pub alias: Option<String>,
    pub active: bool,
    /// True when this token is the one authenticating the current request.
    pub current: bool,
    pub scopes: Vec<Scope>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

/// Instance administration adds ownership, never credential hashes or secrets.
#[derive(Debug, Serialize)]
pub struct ApiTokenAdminPublic {
    #[serde(flatten)]
    pub token: ApiTokenPublic,
    pub owner_subject: Option<String>,
}

/// Returned once at creation — includes the raw token
#[derive(Debug, Serialize)]
pub struct ApiTokenCreated {
    pub id: String,
    pub alias: Option<String>,
    pub token: String,
    pub scopes: Vec<Scope>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateApiToken {
    pub alias: Option<String>,
    /// Defaults to ["all"] when omitted, subject to caller attenuation.
    pub scopes: Option<Vec<Scope>>,
    /// Set by the server from the caller's Identity — not accepted from the request body.
    #[serde(skip_deserializing)]
    pub created_by: Option<String>,
    #[serde(skip_deserializing)]
    pub owner_subject: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateApiTokenScopes {
    pub scopes: Vec<Scope>,
}

impl ApiToken {
    pub fn new(req: CreateApiToken, token_hash: String) -> Self {
        let now = Utc::now().to_rfc3339();
        let scopes = req
            .scopes
            .map(|v| scopes_csv(&v))
            .unwrap_or_else(|| "all".to_string());
        ApiToken {
            id: Uuid::new_v4().to_string(),
            alias: req.alias,
            token_hash,
            active: true,
            scopes_csv: scopes,
            created_by: req.created_by,
            owner_subject: req.owner_subject,
            created_at: now,
            last_used_at: None,
        }
    }

    pub fn scopes_vec(&self) -> AppResult<Vec<Scope>> {
        parse_scopes(&self.scopes_csv)
            .map_err(|_| AppError::Internal("invalid stored API token scopes".into()))
    }
}
