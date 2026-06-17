pub mod identity;
pub mod oidc;

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
}

impl AppState {
    pub fn new(
        pool: SqlitePool,
        dev_mode: bool,
        oidc: Option<OidcValidator>,
        static_dir: Option<String>,
    ) -> Self {
        AppState {
            pool,
            dev_mode,
            oidc: oidc.map(Arc::new),
            static_dir,
        }
    }
}
