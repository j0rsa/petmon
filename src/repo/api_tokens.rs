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
        "SELECT id, alias, token_hash, active, scopes, created_by, created_at, last_used_at
         FROM api_tokens ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn create(
    pool: &SqlitePool,
    req: CreateApiToken,
) -> AppResult<(ApiToken, ApiTokenCreated)> {
    let raw = generate_token();
    let hash = hash_token(&raw);
    let token = ApiToken::new(req, hash);

    sqlx::query(
        "INSERT INTO api_tokens (id, alias, token_hash, active, scopes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&token.id)
    .bind(&token.alias)
    .bind(&token.token_hash)
    .bind(token.active)
    .bind(&token.scopes)
    .bind(&token.created_by)
    .bind(&token.created_at)
    .execute(pool)
    .await?;

    let created = ApiTokenCreated {
        id: token.id.clone(),
        alias: token.alias.clone(),
        token: raw,
        scopes: token.scopes_vec(),
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

pub async fn update_scopes(
    pool: &SqlitePool,
    id: &str,
    req: UpdateApiTokenScopes,
) -> AppResult<ApiToken> {
    let scopes_str = req.scopes.join(",");
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
        "SELECT id, alias, token_hash, active, scopes, created_by, created_at, last_used_at
         FROM api_tokens WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("API token '{id}' not found")))
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
        "SELECT id, alias, token_hash, active, scopes, created_by, created_at, last_used_at
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
