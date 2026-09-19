//! Live instance authority and credential attenuation. Neither `all` nor legacy
//! empty scopes grant API tokens administrative authority.
use sqlx::SqlitePool;

use crate::{
    auth::identity::{Identity, IdentityKind},
    domain::settings::is_valid_scope,
    error::{AppError, AppResult},
    repo::instance_admins,
};

pub async fn is_instance_admin(pool: &SqlitePool, identity: &Identity) -> AppResult<bool> {
    if matches!(identity.kind, IdentityKind::Dev) {
        return Ok(true);
    }
    instance_admins::contains(pool, &identity.subject).await
}

pub async fn effective_capabilities(
    pool: &SqlitePool,
    identity: &Identity,
) -> AppResult<Vec<String>> {
    let mut capabilities = identity.ordinary_capabilities();
    if identity.has_scope("instance_admin") && is_instance_admin(pool, identity).await? {
        capabilities.push("instance_admin".into());
    }
    Ok(capabilities)
}

pub async fn require_instance_admin(pool: &SqlitePool, identity: &Identity) -> AppResult<()> {
    if identity.has_scope("instance_admin") && is_instance_admin(pool, identity).await? {
        Ok(())
    } else {
        Err(AppError::Forbidden(
            "instance administrator capability required".into(),
        ))
    }
}

/// Missing input retains the existing ordinary `all` default, but only when
/// that default is within the caller's authority. Empty input is always invalid.
pub async fn attenuate_scopes(
    pool: &SqlitePool,
    identity: &Identity,
    requested: Option<Vec<String>>,
) -> AppResult<Vec<String>> {
    let mut scopes = requested.unwrap_or_else(|| vec!["all".into()]);
    if scopes.is_empty() {
        return Err(AppError::BadRequest(
            "at least one scope is required".into(),
        ));
    }
    let available = effective_capabilities(pool, identity).await?;
    for scope in &scopes {
        if !is_valid_scope(scope) {
            return Err(AppError::BadRequest(format!("unknown scope '{scope}'")));
        }
        let permitted = if scope == "all" {
            ["api_read", "api_write", "mcp"]
                .iter()
                .all(|s| available.iter().any(|a| a == s))
        } else {
            available.contains(scope)
        };
        if !permitted {
            return Err(AppError::Forbidden(format!(
                "cannot grant scope '{scope}' beyond this credential's authority"
            )));
        }
    }
    scopes.sort();
    scopes.dedup();
    Ok(scopes)
}

/// Credential management is not an MCP care operation. Both REST and MCP
/// adapters use this boundary so aliases cannot bypass owner/scope checks.
pub async fn update_owned_token_scopes(
    pool: &SqlitePool,
    identity: &Identity,
    token_id: &str,
    requested: Vec<String>,
) -> AppResult<crate::domain::settings::ApiToken> {
    if !identity.has_scope("api_write") {
        return Err(AppError::Forbidden(
            "api_write scope required for credential management".into(),
        ));
    }
    let scopes = attenuate_scopes(pool, identity, Some(requested)).await?;
    let token =
        crate::repo::api_tokens::update_scopes_owned(pool, token_id, &identity.subject, &scopes)
            .await?;
    tracing::info!(actor = %identity.subject, action = "token.scopes", target = token_id, "administrative action");
    Ok(token)
}

pub async fn bootstrap_from_env(pool: &SqlitePool) -> AppResult<()> {
    let subjects: Vec<String> = std::env::var("INSTANCE_ADMIN_SUBJECTS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect();
    instance_admins::bootstrap(pool, &subjects).await?;
    Ok(())
}

/// Run before server workers/auth initialization. Uses deployment DATABASE_URL.
/// `petmon admin list|grant <subject>|revoke <subject>` is offline recovery.
pub async fn run_cli(pool: &SqlitePool, args: Vec<String>) -> AppResult<bool> {
    if args.first().map(String::as_str) != Some("admin") {
        return Ok(false);
    }
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["admin", "list"] => {
            for subject in instance_admins::list(pool).await? {
                println!("{subject}");
            }
        }
        ["admin", "grant", subject] => instance_admins::grant(pool, subject).await?,
        ["admin", "revoke", subject] => instance_admins::revoke(pool, subject).await?,
        _ => {
            return Err(AppError::BadRequest(
                "usage: petmon admin list | grant <subject> | revoke <subject>".into(),
            ))
        }
    }
    Ok(true)
}
