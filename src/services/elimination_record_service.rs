use crate::domain::elimination::{
    CreateEliminationRecord, EliminationRecord, EliminationRecordFilters, UpdateEliminationRecord,
};
use crate::error::{AppError, AppResult};
use crate::repo::{elimination_records, pets};
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &SqlitePool,
    filters: EliminationRecordFilters,
) -> AppResult<Vec<EliminationRecord>> {
    elimination_records::list(pool, &filters).await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<EliminationRecord> {
    elimination_records::get(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &SqlitePool,
    req: CreateEliminationRecord,
    timezone: Tz,
) -> AppResult<EliminationRecord> {
    // Validate pet exists
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    elimination_records::create(pool, req, timezone).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    req: UpdateEliminationRecord,
) -> AppResult<EliminationRecord> {
    elimination_records::update(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    elimination_records::delete(pool, id).await
}
