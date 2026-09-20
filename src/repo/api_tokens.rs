use crate::domain::{auth::Scope, settings::scopes_csv};
use chrono::Utc;
use sqlx::SqlitePool;

use crate::domain::settings::{ApiToken, ApiTokenCreated, CreateApiToken, UpdateApiTokenScopes};
use crate::error::{AppError, AppResult};

use rand::Rng;
use sha2::{Digest, Sha256};

fn generate_token() -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    format!("pm_api_{}", hex::encode(bytes))
}

fn hash_token(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<ApiToken>> {
    Ok(sqlx::query_as::<_, ApiToken>(
        "SELECT id, alias, token_hash, active, scopes, created_by, owner_subject, created_at, last_used_at
         FROM api_tokens ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn list_owned(pool: &SqlitePool, owner: &str) -> AppResult<Vec<ApiToken>> {
    Ok(sqlx::query_as::<_, ApiToken>(
        "SELECT * FROM api_tokens WHERE owner_subject = ? ORDER BY created_at DESC",
    )
    .bind(owner)
    .fetch_all(pool)
    .await?)
}

pub async fn get_owned(pool: &SqlitePool, id: &str, owner: &str) -> AppResult<ApiToken> {
    sqlx::query_as::<_, ApiToken>("SELECT * FROM api_tokens WHERE id = ? AND owner_subject = ?")
        .bind(id)
        .bind(owner)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("API token not found".into()))
}

pub async fn set_active_owned(
    pool: &SqlitePool,
    id: &str,
    owner: &str,
    active: bool,
) -> AppResult<()> {
    let rows = sqlx::query("UPDATE api_tokens SET active = ? WHERE id = ? AND owner_subject = ?")
        .bind(active)
        .bind(id)
        .bind(owner)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound("API token not found".into()));
    }
    Ok(())
}

pub async fn delete_owned(
    pool: &SqlitePool,
    id: &str,
    owner: &str,
    require_inactive: bool,
) -> AppResult<()> {
    if require_inactive && get_owned(pool, id, owner).await?.active {
        return Err(AppError::BadRequest(
            "API token is still active — deactivate it first".into(),
        ));
    }
    let rows = sqlx::query(
        "DELETE FROM api_tokens WHERE id = ? AND owner_subject = ? AND (? = 0 OR active = 0)",
    )
    .bind(id)
    .bind(owner)
    .bind(require_inactive)
    .execute(pool)
    .await?
    .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(
            "API token not found or still active".into(),
        ));
    }
    Ok(())
}

pub async fn update_scopes_owned(
    pool: &SqlitePool,
    id: &str,
    owner: &str,
    scopes: &[Scope],
) -> AppResult<ApiToken> {
    sqlx::query_as::<_, ApiToken>(
        "UPDATE api_tokens SET scopes = ? WHERE id = ? AND owner_subject = ? RETURNING *",
    )
    .bind(scopes_csv(scopes))
    .bind(id)
    .bind(owner)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("API token not found".into()))
}

pub async fn create(
    pool: &SqlitePool,
    req: CreateApiToken,
) -> AppResult<(ApiToken, ApiTokenCreated)> {
    let raw = generate_token();
    let hash = hash_token(&raw);
    let token = ApiToken::new(req, hash);

    sqlx::query(
        "INSERT INTO api_tokens (id, alias, token_hash, active, scopes, created_by, owner_subject, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&token.id)
    .bind(&token.alias)
    .bind(&token.token_hash)
    .bind(token.active)
    .bind(&token.scopes_csv)
    .bind(&token.created_by)
    .bind(&token.owner_subject)
    .bind(&token.created_at)
    .execute(pool)
    .await?;

    let created = ApiTokenCreated {
        id: token.id.clone(),
        alias: token.alias.clone(),
        token: raw,
        scopes: token.scopes_vec()?,
        created_at: token.created_at.clone(),
    };

    Ok((token, created))
}

pub async fn activate(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("UPDATE api_tokens SET active = 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("API token '{id}' not found")));
    }
    Ok(())
}

pub async fn deactivate(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("UPDATE api_tokens SET active = 0 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("API token '{id}' not found")));
    }
    Ok(())
}

/// Revoke every active token owned by a canonical subject. This is intentionally
/// an administrative operation; ordinary owners can only revoke one of their own.
pub async fn deactivate_all_owned(pool: &SqlitePool, owner: &str) -> AppResult<u64> {
    Ok(
        sqlx::query("UPDATE api_tokens SET active = 0 WHERE owner_subject = ? AND active = 1")
            .bind(owner)
            .execute(pool)
            .await?
            .rows_affected(),
    )
}

pub async fn update_scopes(
    pool: &SqlitePool,
    id: &str,
    req: UpdateApiTokenScopes,
) -> AppResult<ApiToken> {
    let scopes_str = scopes_csv(&req.scopes);
    let rows = sqlx::query("UPDATE api_tokens SET scopes = ? WHERE id = ?")
        .bind(&scopes_str)
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("API token '{id}' not found")));
    }
    sqlx::query_as::<_, ApiToken>(
        "SELECT id, alias, token_hash, active, scopes, created_by, owner_subject, created_at, last_used_at
         FROM api_tokens WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("API token '{id}' not found")))
}

/// Permanently removes a token regardless of active state (used on sign-out).
pub async fn delete_by_id(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM api_tokens WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("API token '{id}' not found")));
    }
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM api_tokens WHERE id = ? AND active = 0")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::BadRequest(format!(
            "API token '{id}' not found or still active — deactivate it first"
        )));
    }
    Ok(())
}

pub async fn has_active_tokens(pool: &SqlitePool) -> bool {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM api_tokens WHERE active = 1")
        .fetch_one(pool)
        .await
        .unwrap_or(0)
        > 0
}

pub async fn find_by_hash(pool: &SqlitePool, raw_token: &str) -> AppResult<Option<ApiToken>> {
    let hash = hash_token(raw_token);
    let token = sqlx::query_as::<_, ApiToken>(
        "SELECT id, alias, token_hash, active, scopes, created_by, owner_subject, created_at, last_used_at
         FROM api_tokens WHERE token_hash = ? AND active = 1",
    )
    .bind(&hash)
    .fetch_optional(pool)
    .await?;

    if let Some(ref t) = token {
        let now = Utc::now().to_rfc3339();
        let _ = sqlx::query("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
            .bind(&now)
            .bind(&t.id)
            .execute(pool)
            .await;
    }

    Ok(token)
}
