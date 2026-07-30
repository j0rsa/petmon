use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::push::PushSubscribeRequest;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PushSubscriptionRow {
    pub id: String,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub reader_key: String,
    pub user_agent: Option<String>,
    pub created_at: String,
}

#[tracing::instrument(skip(pool, req))]
pub async fn upsert(
    pool: &SqlitePool,
    reader_key: &str,
    req: &PushSubscribeRequest,
    user_agent: Option<&str>,
) -> AppResult<PushSubscriptionRow> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, reader_key, user_agent, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(endpoint) DO UPDATE SET \
           p256dh = excluded.p256dh, \
           auth = excluded.auth, \
           reader_key = excluded.reader_key, \
           user_agent = excluded.user_agent",
    )
    .bind(&id)
    .bind(&req.endpoint)
    .bind(&req.keys.p256dh)
    .bind(&req.keys.auth)
    .bind(reader_key)
    .bind(user_agent)
    .bind(&now)
    .execute(pool)
    .await?;

    get_by_endpoint(pool, &req.endpoint).await
}

#[tracing::instrument(skip(pool))]
pub async fn get_by_endpoint(pool: &SqlitePool, endpoint: &str) -> AppResult<PushSubscriptionRow> {
    sqlx::query_as::<_, PushSubscriptionRow>(
        "SELECT id, endpoint, p256dh, auth, reader_key, user_agent, created_at \
         FROM push_subscriptions WHERE endpoint = ?",
    )
    .bind(endpoint)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Push subscription not found".to_string()))
}

#[tracing::instrument(skip(pool))]
pub async fn delete_by_endpoint(pool: &SqlitePool, endpoint: &str) -> AppResult<bool> {
    let result = sqlx::query("DELETE FROM push_subscriptions WHERE endpoint = ?")
        .bind(endpoint)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

#[tracing::instrument(skip(pool))]
pub async fn list_all(pool: &SqlitePool) -> AppResult<Vec<PushSubscriptionRow>> {
    let rows = sqlx::query_as::<_, PushSubscriptionRow>(
        "SELECT id, endpoint, p256dh, auth, reader_key, user_agent, created_at \
         FROM push_subscriptions ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
