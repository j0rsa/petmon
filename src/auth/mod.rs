pub mod identity;
pub mod oidc;

use chrono_tz::Tz;
use sqlx::SqlitePool;
use std::sync::Arc;

use oidc::OidcValidator;

/// Shared application state injected into every handler.
#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub dev_mode: bool,
    pub oidc: Option<Arc<OidcValidator>>,
    pub static_dir: Option<String>,
    pub timezone: Tz,
    /// True when `DEMO_MODE` env is set (demo seed + UI banner).
    pub demo_mode: bool,
}

impl AppState {
    pub fn new(
        pool: SqlitePool,
        dev_mode: bool,
        oidc: Option<OidcValidator>,
        static_dir: Option<String>,
    ) -> Self {
        AppState::new_with_tz(pool, dev_mode, oidc, static_dir, chrono_tz::UTC, false)
    }

    pub fn new_with_tz(
        pool: SqlitePool,
        dev_mode: bool,
        oidc: Option<OidcValidator>,
        static_dir: Option<String>,
        timezone: Tz,
        demo_mode: bool,
    ) -> Self {
        AppState {
            pool,
            dev_mode,
            oidc: oidc.map(Arc::new),
            static_dir,
            timezone,
            demo_mode,
        }
    }
}
