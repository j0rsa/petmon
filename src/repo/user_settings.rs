use chrono::Utc;
use serde::de::DeserializeOwned;
use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};

pub async fn get<T: DeserializeOwned + Default>(
    pool: &SqlitePool,
    reader_key: &str,
    key: &str,
) -> AppResult<T> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value_json FROM user_settings WHERE reader_key = ? AND key = ?")
            .bind(reader_key)
            .bind(key)
            .fetch_optional(pool)
            .await?;

    match row {
        None => Ok(T::default()),
        Some((json,)) => serde_json::from_str(&json).map_err(|e| {
            AppError::Internal(format!(
                "Failed to deserialize user setting '{key}' for '{reader_key}': {e}"
            ))
        }),
    }
}

/// Return all (reader_key, deserialized value) pairs for a given settings key.
/// Rows that fail to deserialize are silently skipped.
pub async fn list_all_by_key<T: DeserializeOwned + Default>(
    pool: &SqlitePool,
    key: &str,
) -> AppResult<Vec<(String, T)>> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT reader_key, value_json FROM user_settings WHERE key = ?")
            .bind(key)
            .fetch_all(pool)
            .await?;

    Ok(rows
        .into_iter()
        .filter_map(|(reader_key, json)| {
            serde_json::from_str::<T>(&json)
                .ok()
                .map(|v| (reader_key, v))
        })
        .collect())
}

pub async fn upsert<T: Serialize>(
    pool: &SqlitePool,
    reader_key: &str,
    key: &str,
    value: &T,
) -> AppResult<()> {
    let json = serde_json::to_string(value).map_err(|e| {
        AppError::Internal(format!(
            "Failed to serialize user setting '{key}' for '{reader_key}': {e}"
        ))
    })?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO user_settings (reader_key, key, value_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(reader_key, key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
    )
    .bind(reader_key)
    .bind(key)
    .bind(json)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}
