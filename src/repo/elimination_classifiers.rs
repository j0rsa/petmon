use crate::domain::elimination_classifier::EliminationClassifierModel;
use crate::error::AppResult;
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct ClassifierRow {
    model_json: String,
}

pub async fn get(pool: &SqlitePool, pet_id: Uuid) -> AppResult<Option<EliminationClassifierModel>> {
    let row = sqlx::query_as::<_, ClassifierRow>(
        "SELECT model_json FROM elimination_classifiers WHERE pet_id = ?",
    )
    .bind(pet_id)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => {
            let model: EliminationClassifierModel =
                serde_json::from_str(&r.model_json).map_err(|e| {
                    crate::error::AppError::Internal(format!("invalid classifier json: {e}"))
                })?;
            Ok(Some(model))
        }
        None => Ok(None),
    }
}

pub async fn upsert(
    pool: &SqlitePool,
    pet_id: Uuid,
    model: &EliminationClassifierModel,
) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let json = serde_json::to_string(model).map_err(|e| {
        crate::error::AppError::Internal(format!("classifier serialize failed: {e}"))
    })?;

    sqlx::query(
        "INSERT INTO elimination_classifiers (pet_id, model_version, model_json, sample_count, trained_at, pending_retrain, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(pet_id) DO UPDATE SET
           model_version = excluded.model_version,
           model_json = excluded.model_json,
           sample_count = excluded.sample_count,
           trained_at = excluded.trained_at,
           pending_retrain = 0,
           updated_at = excluded.updated_at",
    )
    .bind(pet_id)
    .bind(model.version as i64)
    .bind(json)
    .bind(model.sample_count)
    .bind(&model.trained_at)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_pending_retrain(pool: &SqlitePool, pet_id: Uuid) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE elimination_classifiers SET pending_retrain = 1, updated_at = ? WHERE pet_id = ?",
    )
    .bind(&now)
    .bind(pet_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn clear_pending(pool: &SqlitePool, pet_id: Uuid) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE elimination_classifiers SET pending_retrain = 0, updated_at = ? WHERE pet_id = ?",
    )
    .bind(now)
    .bind(pet_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn pending_pet_ids(pool: &SqlitePool, limit: i64) -> AppResult<Vec<Uuid>> {
    let rows = sqlx::query_scalar::<_, Uuid>(
        "SELECT pet_id FROM elimination_classifiers WHERE pending_retrain = 1 LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
