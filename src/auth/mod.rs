use std::sync::Arc;

use chrono_tz::Tz;
use sqlx::SqlitePool;

use crate::auth::oidc::OidcValidator;

pub mod identity;
pub mod oidc;

pub struct AppState {
    pub pool: SqlitePool,
    pub dev_mode: bool,
    pub oidc: Option<Arc<OidcValidator>>,
    pub static_dir: Option<String>,
    pub timezone: Tz,
    /// True when `DEMO_MODE` env is set (demo seed + UI banner).
    pub demo_mode: bool,
    /// iCloud share link for the med-intake shortcut (iPhone import). From env or publish.json.
    pub med_intake_shortcut_icloud_url: Option<String>,
}

impl AppState {
    pub fn new(
        pool: SqlitePool,
        dev_mode: bool,
        oidc: Option<OidcValidator>,
        static_dir: Option<String>,
    ) -> Self {
        AppState::new_with_tz(
            pool,
            dev_mode,
            oidc,
            static_dir,
            chrono_tz::UTC,
            false,
            None,
        )
    }

    pub fn new_with_tz(
        pool: SqlitePool,
        dev_mode: bool,
        oidc: Option<OidcValidator>,
        static_dir: Option<String>,
        timezone: Tz,
        demo_mode: bool,
        med_intake_shortcut_icloud_url: Option<String>,
    ) -> Self {
        AppState {
            pool,
            dev_mode,
            oidc: oidc.map(Arc::new),
            static_dir,
            timezone,
            demo_mode,
            med_intake_shortcut_icloud_url,
        }
    }
}
