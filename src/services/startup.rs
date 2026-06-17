use sqlx::SqlitePool;

use crate::domain::settings::OidcConfig;
use crate::repo::settings;

/// If any of the OIDC_* env vars are present, merge them over whatever is
/// stored in the database.  This lets container deployments inject OIDC config
/// via the environment without losing fields that were set through the UI.
pub async fn sync_oidc_from_env(pool: &SqlitePool) {
    let issuer_url = std::env::var("OIDC_ISSUER_URL").ok();
    let client_id = std::env::var("OIDC_CLIENT_ID").ok();
    let enabled = std::env::var("OIDC_ENABLED")
        .ok()
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"));

    if issuer_url.is_none() && client_id.is_none() && enabled.is_none() {
        return;
    }

    let existing: OidcConfig = match settings::get(pool, "oidc").await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, "failed to load OIDC config during startup sync");
            return;
        }
    };

    let merged = OidcConfig {
        enabled: enabled.unwrap_or(existing.enabled),
        issuer_url: issuer_url.or(existing.issuer_url),
        client_id: client_id.or(existing.client_id),
    };

    match settings::upsert(pool, "oidc", &merged).await {
        Ok(()) => tracing::info!("OIDC config synced from environment"),
        Err(e) => tracing::warn!(error = %e, "failed to persist OIDC config from environment"),
    }
}
