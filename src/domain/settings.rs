use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── OIDC ─────────────────────────────────────────────────────────────────────

/// Stored in app_settings where key = 'oidc'.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OidcConfig {
    pub enabled: bool,
    /// OIDC issuer URL used for autodiscovery (/.well-known/openid-configuration)
    pub issuer_url: Option<String>,
    pub client_id: Option<String>,
}

/// What GET /settings/oidc returns.
#[derive(Debug, Serialize)]
pub struct OidcConfigPublic {
    pub enabled: bool,
    pub issuer_url: Option<String>,
    pub client_id: Option<String>,
}

impl From<OidcConfig> for OidcConfigPublic {
    fn from(c: OidcConfig) -> Self {
        OidcConfigPublic {
            enabled: c.enabled,
            issuer_url: c.issuer_url,
            client_id: c.client_id,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateOidcConfig {
    pub enabled: Option<bool>,
    pub issuer_url: Option<String>,
    pub client_id: Option<String>,
}

impl UpdateOidcConfig {
    pub fn apply(self, existing: OidcConfig) -> OidcConfig {
        OidcConfig {
            enabled: self.enabled.unwrap_or(existing.enabled),
            issuer_url: self.issuer_url.or(existing.issuer_url),
            client_id: self.client_id.or(existing.client_id),
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
            bot_token: self.bot_token.or(existing.bot_token),
        }
    }
}

// ── API tokens ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApiToken {
    pub id: String,
    pub alias: Option<String>,
    pub token_hash: String,
    pub active: bool,
    pub created_by: Option<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

/// What the list/get endpoints return — hash never exposed
#[derive(Debug, Serialize)]
pub struct ApiTokenPublic {
    pub id: String,
    pub alias: Option<String>,
    pub active: bool,
    pub created_by: Option<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

impl From<ApiToken> for ApiTokenPublic {
    fn from(t: ApiToken) -> Self {
        ApiTokenPublic {
            id: t.id,
            alias: t.alias,
            active: t.active,
            created_by: t.created_by,
            created_at: t.created_at,
            last_used_at: t.last_used_at,
        }
    }
}

/// Returned once at creation — includes the raw token
#[derive(Debug, Serialize)]
pub struct ApiTokenCreated {
    pub id: String,
    pub alias: Option<String>,
    pub token: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateApiToken {
    pub alias: Option<String>,
    /// Set by the server from the caller's Identity — not accepted from the request body.
    #[serde(skip_deserializing)]
    pub created_by: Option<String>,
}

impl ApiToken {
    pub fn new(req: CreateApiToken, token_hash: String) -> Self {
        let now = Utc::now().to_rfc3339();
        ApiToken {
            id: Uuid::new_v4().to_string(),
            alias: req.alias,
            token_hash,
            active: true,
            created_by: req.created_by,
            created_at: now,
            last_used_at: None,
        }
    }
}
