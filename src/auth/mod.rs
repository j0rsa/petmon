use std::sync::Arc;

use chrono_tz::Tz;
use sqlx::SqlitePool;

use crate::auth::oidc::OidcValidator;

pub mod admin;
pub mod identity;
pub mod oidc;

pub struct AppState {
    pub edition: String,
    pub application_version: String,
    pub notifications: Arc<dyn crate::notification_runtime::NotificationBackend>,
    pub resource_policy: Arc<dyn crate::embedding::ResourcePolicy>,
    pub runtime: Arc<dyn crate::embedding::RuntimeResolver>,
    pub identity_adapter: Option<Arc<dyn crate::embedding::IdentityAdapter>>,
    pub mcp_registry: crate::mcp::registry::ToolRegistry,
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
    /// Restricted embedders must supply every adapter; no notification/policy fallback.
    pub fn embedded(
        pool: SqlitePool,
        timezone: Tz,
        resource_policy: Arc<dyn crate::embedding::ResourcePolicy>,
        runtime: Arc<dyn crate::embedding::RuntimeResolver>,
        identity_adapter: Arc<dyn crate::embedding::IdentityAdapter>,
        notifications: Arc<dyn crate::notification_runtime::NotificationBackend>,
    ) -> Self {
        Self {
            resource_policy,
            runtime,
            identity_adapter: Some(identity_adapter),
            notifications,
            ..Self::new_with_tz(pool, false, None, None, timezone, false, None)
        }
    }
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
            edition: "oss".into(),
            application_version: env!("CARGO_PKG_VERSION").into(),
            notifications: Arc::new(crate::notification_runtime::StandaloneNotifications),
            resource_policy: Arc::new(crate::embedding::AllowAll),
            runtime: Arc::new(crate::embedding::InstanceRuntime),
            identity_adapter: None,
            mcp_registry: crate::mcp::registry::ToolRegistry::default(),
            pool,
            dev_mode,
            oidc: oidc.map(Arc::new),
            static_dir,
            timezone,
            demo_mode,
            med_intake_shortcut_icloud_url,
        }
    }

    pub fn context(
        &self,
        actor: crate::auth::identity::Identity,
    ) -> crate::embedding::ServiceContext {
        crate::embedding::ServiceContext {
            notifications: self.notifications.clone(),
            pool: self.pool.clone(),
            actor,
            policy: self.resource_policy.clone(),
            runtime: self.runtime.clone(),
            fallback_timezone: self.timezone,
        }
    }

    pub fn worker_context(&self, purpose: &'static str) -> crate::embedding::ServiceContext {
        let mut context = crate::embedding::ServiceContext::trusted(
            self.pool.clone(),
            self.runtime.clone(),
            self.timezone,
            purpose,
        );
        context.notifications = self.notifications.clone();
        context
    }

    pub fn request_context(
        &self,
        req: &actix_web::HttpRequest,
    ) -> crate::error::AppResult<crate::embedding::ServiceContext> {
        use actix_web::HttpMessage;
        let actor = req
            .extensions()
            .get::<crate::auth::identity::Identity>()
            .cloned()
            .ok_or_else(|| {
                crate::error::AppError::Forbidden("authenticated identity required".into())
            })?;
        Ok(self.context(actor))
    }
}
