use chrono::Utc;
use serde::de::DeserializeOwned;
use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};

pub async fn get<T: DeserializeOwned + Default>(pool: &SqlitePool, key: &str) -> AppResult<T> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value_json FROM app_settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;

    match row {
        None => Ok(T::default()),
        Some((json,)) => serde_json::from_str(&json)
            .map_err(|e| AppError::Internal(format!("Failed to deserialize setting '{key}': {e}"))),
    }
}

pub async fn upsert<T: Serialize>(pool: &SqlitePool, key: &str, value: &T) -> AppResult<()> {
    let json = serde_json::to_string(value)
        .map_err(|e| AppError::Internal(format!("Failed to serialize setting '{key}': {e}")))?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(json)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}
