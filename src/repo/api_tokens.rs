use crate::domain::{auth::Scope, settings::scopes_csv};
use chrono::Utc;
use sqlx::SqlitePool;

use crate::domain::settings::{ApiToken, ApiTokenCreated, CreateApiToken, UpdateApiTokenScopes};
use crate::error::{AppError, AppResult};

use rand::Rng;
use sha2::{Digest, Sha256};

pub struct AdminTokenPage {
    pub tokens: Vec<ApiToken>,
    pub total_owners: u64,
}

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

/// Lists every token for one page of owners. Paginating owners, rather than
/// individual tokens, keeps one user's credentials together in admin UI.
pub async fn list_admin_page(
    pool: &SqlitePool,
    name: &str,
    limit: i64,
    offset: i64,
) -> AppResult<AdminTokenPage> {
    let pattern = format!("%{}%", name.to_lowercase());
    let total_owners = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM (
           SELECT owner_subject
           FROM api_tokens
           WHERE ? = '' OR LOWER(COALESCE(created_by, '')) LIKE ?
           GROUP BY owner_subject
         )",
    )
    .bind(name)
    .bind(&pattern)
    .fetch_one(pool)
    .await?;

    let tokens = sqlx::query_as::<_, ApiToken>(
        "WITH page_owners AS (
           SELECT owner_subject,
                  COALESCE(NULLIF(MAX(created_by), ''), owner_subject, '') AS owner_name
           FROM api_tokens
           WHERE ? = '' OR LOWER(COALESCE(created_by, '')) LIKE ?
           GROUP BY owner_subject
           ORDER BY LOWER(owner_name), owner_subject
           LIMIT ? OFFSET ?
         )
         SELECT t.id, t.alias, t.token_hash, t.active, t.scopes, t.created_by,
                t.owner_subject, t.created_at, t.last_used_at
         FROM api_tokens t
         INNER JOIN page_owners p ON t.owner_subject IS p.owner_subject
         ORDER BY LOWER(p.owner_name), p.owner_subject, t.created_at DESC",
    )
    .bind(name)
    .bind(pattern)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(AdminTokenPage {
        tokens,
        total_owners: total_owners.max(0) as u64,
    })
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
