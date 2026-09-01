use chrono::Utc;
use serde::{de::DeserializeOwned, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

pub async fn get<T: DeserializeOwned + Default>(
    pool: &SqlitePool,
    pet_id: &str,
    key: &str,
) -> AppResult<T> {
    // pets.id is stored as a blob (Uuid binding) — parse to Uuid for correct comparison
    let pet_uuid = Uuid::parse_str(pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {pet_id}")))?;
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value_json FROM pet_settings WHERE pet_id = ? AND key = ?")
            .bind(pet_uuid)
            .bind(key)
            .fetch_optional(pool)
            .await?;

    match row {
        None => Ok(T::default()),
        Some((json,)) => serde_json::from_str(&json).map_err(|e| {
            AppError::Internal(format!(
                "Failed to deserialize pet setting '{key}' for pet '{pet_id}': {e}"
            ))
        }),
    }
}

pub async fn upsert<T: Serialize>(
    pool: &SqlitePool,
    pet_id: &str,
    key: &str,
    value: &T,
) -> AppResult<()> {
    // pets.id is stored as a blob (Uuid binding) — use Uuid to match the FK
    let pet_uuid = Uuid::parse_str(pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {pet_id}")))?;
    let json = serde_json::to_string(value).map_err(|e| {
        AppError::Internal(format!(
            "Failed to serialize pet setting '{key}' for pet '{pet_id}': {e}"
        ))
    })?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO pet_settings (pet_id, key, value_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(pet_id, key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
    )
    .bind(pet_uuid)
    .bind(key)
    .bind(json)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Return all (pet_id, deserialized value) pairs for a given settings key.
/// Rows that fail to deserialize are silently skipped.
pub async fn list_all_by_key<T: DeserializeOwned + Default>(
    pool: &SqlitePool,
    key: &str,
) -> AppResult<Vec<(String, T)>> {
    // pet_id is stored as a blob (Uuid binding) — convert back to canonical string form
    let rows: Vec<(Uuid, String)> =
        sqlx::query_as("SELECT pet_id, value_json FROM pet_settings WHERE key = ?")
            .bind(key)
            .fetch_all(pool)
            .await?;

    Ok(rows
        .into_iter()
        .filter_map(|(pet_uuid, json)| {
            serde_json::from_str::<T>(&json)
                .ok()
                .map(|v| (pet_uuid.to_string(), v))
        })
        .collect())
}
