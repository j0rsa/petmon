use crate::domain::health_state::{
    CreateHealthStateRecord, HealthStateRecord, HealthStateRecordFilters,
};
use crate::error::{AppError, AppResult};
use crate::repo::{health_state_records, pets};
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &SqlitePool,
    filters: HealthStateRecordFilters,
) -> AppResult<Vec<HealthStateRecord>> {
    health_state_records::list(pool, &filters).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &SqlitePool,
    req: CreateHealthStateRecord,
    timezone: Tz,
) -> AppResult<HealthStateRecord> {
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    health_state_records::create(pool, req, timezone).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    health_state_records::delete(pool, id).await
}
