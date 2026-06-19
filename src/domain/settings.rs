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

// ── Display ───────────────────────────────────────────────────────────────────

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DisplaySettings {
    #[serde(default)]
    pub time_format: TimeFormat,
    #[serde(default)]
    pub date_format: DateFormat,
    #[serde(default = "default_true")]
    pub show_water_card: bool,
    // Calendar cell metrics
    #[serde(default = "default_true")]
    pub calendar_show_wet_food: bool,
    #[serde(default = "default_true")]
    pub calendar_show_liquids: bool,
    #[serde(default = "default_true")]
    pub calendar_show_water: bool,
    #[serde(default = "default_true")]
    pub calendar_show_dry_food: bool,
    #[serde(default = "default_true")]
    pub calendar_show_record_count: bool,
    #[serde(default = "default_true")]
    pub calendar_show_total_fluid: bool,
    #[serde(default)]
    pub calendar_week_start: WeekStart,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct UpdateDisplaySettings {
    pub time_format: Option<TimeFormat>,
    pub date_format: Option<DateFormat>,
    pub show_water_card: Option<bool>,
    pub calendar_show_wet_food: Option<bool>,
    pub calendar_show_liquids: Option<bool>,
    pub calendar_show_water: Option<bool>,
    pub calendar_show_dry_food: Option<bool>,
    pub calendar_show_record_count: Option<bool>,
    pub calendar_show_total_fluid: Option<bool>,
    pub calendar_week_start: Option<WeekStart>,
}

impl UpdateDisplaySettings {
    pub fn apply(self, existing: DisplaySettings) -> DisplaySettings {
        DisplaySettings {
            time_format: self.time_format.unwrap_or(existing.time_format),
            date_format: self.date_format.unwrap_or(existing.date_format),
            show_water_card: self.show_water_card.unwrap_or(existing.show_water_card),
            calendar_show_wet_food: self
                .calendar_show_wet_food
                .unwrap_or(existing.calendar_show_wet_food),
            calendar_show_liquids: self
                .calendar_show_liquids
                .unwrap_or(existing.calendar_show_liquids),
            calendar_show_water: self
                .calendar_show_water
                .unwrap_or(existing.calendar_show_water),
            calendar_show_dry_food: self
                .calendar_show_dry_food
                .unwrap_or(existing.calendar_show_dry_food),
            calendar_show_record_count: self
                .calendar_show_record_count
                .unwrap_or(existing.calendar_show_record_count),
            calendar_show_total_fluid: self
                .calendar_show_total_fluid
                .unwrap_or(existing.calendar_show_total_fluid),
            calendar_week_start: self
                .calendar_week_start
                .unwrap_or(existing.calendar_week_start),
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
    /// True when this token is the one authenticating the current request.
    pub current: bool,
    pub created_by: Option<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
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
