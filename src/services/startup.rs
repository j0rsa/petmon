use sqlx::SqlitePool;

use crate::domain::settings::OidcConfig;
use crate::repo::settings;
use crate::services::push_service;

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
        // Group fields are not configurable via env — keep whatever is in the DB.
        groups_claim: existing.groups_claim,
        full_access_group: existing.full_access_group,
        readonly_group: existing.readonly_group,
    };

    match settings::upsert(pool, "oidc", &merged).await {
        Ok(()) => tracing::info!("OIDC config synced from environment"),
        Err(e) => tracing::warn!(error = %e, "failed to persist OIDC config from environment"),
    }
}

pub async fn cleanup_push_subscriptions(pool: &SqlitePool) {
    match push_service::cleanup_stale_subscriptions(pool).await {
        Ok(removed) if removed > 0 => {
            tracing::info!(removed, "push subscription cleanup complete");
        }
        Ok(_) => {}
        Err(e) => tracing::warn!(error = %e, "push subscription cleanup failed"),
    }
}

/// When `demo_mode` is on and the database has no pets yet, load demo seed data (append-only).
pub async fn maybe_seed_demo(pool: &SqlitePool, demo_mode: bool) {
    if !demo_mode {
        return;
    }

    match crate::demo_seed::is_empty_database(pool).await {
        Ok(true) => {}
        Ok(false) => {
            tracing::info!("DEMO_MODE enabled — database already has data, skipping demo seed");
            return;
        }
        Err(e) => {
            tracing::warn!(error = %e, "DEMO_MODE enabled but failed to check database state");
            return;
        }
    }

    match crate::demo_seed::run(pool, false).await {
        Ok(summary) => tracing::info!(
            pets = summary.pets,
            nutrition_records = summary.nutrition_records,
            elimination_records = summary.elimination_records,
            weight_records = summary.weight_records,
            day_notes = summary.day_notes,
            schedules = summary.schedules,
            "DEMO_MODE loaded demo seed data into empty database"
        ),
        Err(e) => tracing::error!(error = %e, "DEMO_MODE failed to load demo seed data"),
    }
}
