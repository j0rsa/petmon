//! Explicit application context for reusable care services. Repositories are persistence primitives.
use crate::{
    auth::identity::Identity,
    error::{AppError, AppResult},
};
use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use futures::future::BoxFuture;
use sqlx::SqlitePool;
use std::{ops::Deref, sync::Arc};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResourceAction {
    View,
    WriteRecords,
    WriteProfile,
    ManageIntegrations,
    Create,
    Delete,
    ChangeStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PetVisibility {
    All,
    Ids(Vec<Uuid>),
}

impl PetVisibility {
    /// IDs are typed UUIDs, never caller-provided SQL. JSON avoids SQLite parameter limits.
    pub(crate) fn predicate(&self, column: &str) -> String {
        match self {
            Self::All => "1=1".into(),
            Self::Ids(ids) => {
                let ids: Vec<_> = ids.iter().map(|id| id.simple().to_string()).collect();
                let json = serde_json::to_string(&ids).expect("UUID JSON");
                format!("(lower(hex({column})) IN (SELECT value FROM json_each('{json}')) OR replace(lower(CAST({column} AS TEXT)), '-', '') IN (SELECT value FROM json_each('{json}')))")
            }
        }
    }
}

pub trait ResourcePolicy: Send + Sync {
    /// Lifecycle authorization shares the extension's transaction, avoiding a check/commit gap.
    fn authorize_transaction<'a>(
        &'a self,
        _connection: &'a mut sqlx::SqliteConnection,
        _actor: &'a Identity,
        _pet: Option<Uuid>,
        _action: ResourceAction,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Forbidden(
                "transactional lifecycle policy required".into(),
            ))
        })
    }
    fn authorize<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
        pet: Option<Uuid>,
        action: ResourceAction,
    ) -> BoxFuture<'a, AppResult<()>>;
    fn visibility<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
    ) -> BoxFuture<'a, AppResult<PetVisibility>>;
}

/// Standalone shared-pet behavior; embedders must explicitly choose their own policy.
pub struct AllowAll;
impl ResourcePolicy for AllowAll {
    fn authorize_transaction<'a>(
        &'a self,
        _: &'a mut sqlx::SqliteConnection,
        _: &'a Identity,
        _: Option<Uuid>,
        _: ResourceAction,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async { Ok(()) })
    }
    fn authorize<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
        _: Option<Uuid>,
        _: ResourceAction,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async { Ok(()) })
    }
    fn visibility<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
    ) -> BoxFuture<'a, AppResult<PetVisibility>> {
        Box::pin(async { Ok(PetVisibility::All) })
    }
}

pub trait RuntimeResolver: Send + Sync {
    /// Resolve the canonical actor's session timezone, independent of selected pets.
    /// Trusted jobs carry their own actor; standalone returns the instance fallback.
    fn timezone<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
        fallback: Tz,
    ) -> BoxFuture<'a, AppResult<Tz>>;
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}
pub struct InstanceRuntime;
impl RuntimeResolver for InstanceRuntime {
    fn timezone<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
        fallback: Tz,
    ) -> BoxFuture<'a, AppResult<Tz>> {
        Box::pin(async move { Ok(fallback) })
    }
}

/// Startup-provided authentication adapter; errors deny access and never fall back.
pub trait IdentityAdapter: Send + Sync {
    fn authenticate<'a>(
        &'a self,
        pool: &'a SqlitePool,
        bearer: &'a str,
    ) -> BoxFuture<'a, AppResult<Identity>>;
    /// Override for cookie/social sessions. Only a trusted startup adapter reads these headers.
    fn authenticate_request<'a>(
        &'a self,
        pool: &'a SqlitePool,
        _method: &'a str,
        _path: &'a str,
        headers: &'a actix_web::http::header::HeaderMap,
    ) -> BoxFuture<'a, AppResult<Identity>> {
        Box::pin(async move {
            let bearer = headers
                .get("Authorization")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.strip_prefix("Bearer "))
                .ok_or_else(|| AppError::Forbidden("bearer credential required".into()))?;
            self.authenticate(pool, bearer).await
        })
    }
    /// Revalidate the canonical account on every API-token request (including disabled accounts).
    /// Credential scopes and token provenance remain server-owned and cannot be changed here.
    fn resolve_api_token_owner<'a>(
        &'a self,
        _pool: &'a SqlitePool,
        _subject: &'a str,
    ) -> BoxFuture<'a, AppResult<CanonicalActor>> {
        Box::pin(async {
            Err(AppError::Forbidden(
                "API token account resolution is not configured".into(),
            ))
        })
    }
}

pub struct CanonicalActor {
    pub subject: String,
    pub email: Option<String>,
}

#[derive(Clone)]
pub struct ServiceContext {
    pub notifications: Arc<dyn crate::notification_runtime::NotificationBackend>,
    pub pool: SqlitePool,
    pub actor: Identity,
    pub policy: Arc<dyn ResourcePolicy>,
    pub runtime: Arc<dyn RuntimeResolver>,
    pub fallback_timezone: Tz,
}
impl Deref for ServiceContext {
    type Target = SqlitePool;
    fn deref(&self) -> &SqlitePool {
        &self.pool
    }
}
impl ServiceContext {
    pub fn standalone(pool: SqlitePool, timezone: Tz) -> Self {
        Self {
            notifications: Arc::new(crate::notification_runtime::StandaloneNotifications),
            pool,
            actor: Identity::dev(),
            policy: Arc::new(AllowAll),
            runtime: Arc::new(InstanceRuntime),
            fallback_timezone: timezone,
        }
    }
    /// Explicit trusted maintenance context. Do not construct this for user requests.
    pub fn trusted(
        pool: SqlitePool,
        runtime: Arc<dyn RuntimeResolver>,
        timezone: Tz,
        purpose: &'static str,
    ) -> Self {
        assert!(!purpose.is_empty(), "trusted context requires a purpose");
        tracing::debug!(purpose, "trusted service context");
        Self {
            runtime,
            ..Self::standalone(pool, timezone)
        }
    }
    pub fn require_action_scope(&self, action: ResourceAction) -> AppResult<()> {
        let scope = if action == ResourceAction::View {
            crate::domain::auth::Scope::ApiRead
        } else {
            crate::domain::auth::Scope::ApiWrite
        };
        if self.actor.has_scope(scope) || self.actor.has_scope(crate::domain::auth::Scope::Mcp) {
            Ok(())
        } else {
            Err(AppError::Forbidden(format!("{scope} capability required")))
        }
    }
    pub async fn check(&self, pet: Option<Uuid>, action: ResourceAction) -> AppResult<()> {
        self.require_action_scope(action)?;
        self.policy
            .authorize(&self.pool, &self.actor, pet, action)
            .await
    }
    pub async fn check_str(&self, pet: &str, action: ResourceAction) -> AppResult<Uuid> {
        let id = Uuid::parse_str(pet).map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
        self.check(Some(id), action).await?;
        Ok(id)
    }
    pub async fn visibility(&self, pet: Option<Uuid>) -> AppResult<PetVisibility> {
        self.require_action_scope(ResourceAction::View)?;
        if let Some(pet) = pet {
            self.check(Some(pet), ResourceAction::View).await?;
            Ok(PetVisibility::Ids(vec![pet]))
        } else {
            self.policy.visibility(&self.pool, &self.actor).await
        }
    }
    pub async fn visibility_str(&self, pet: Option<&str>) -> AppResult<PetVisibility> {
        let id = pet
            .map(Uuid::parse_str)
            .transpose()
            .map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
        self.visibility(id).await
    }
    pub async fn timezone(&self) -> AppResult<Tz> {
        self.runtime
            .timezone(&self.pool, &self.actor, self.fallback_timezone)
            .await
    }
    /// Preserve civil journal dates; callers may explicitly backdate independently of now.
    pub fn record_timestamp(&self, timezone: Tz, local_date: Option<&str>) -> AppResult<String> {
        Ok(crate::record_time::resolve(None, local_date, timezone, self.runtime.now())?.utc)
    }
}
