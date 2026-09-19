use crate::domain::health_state::{
    CreateHealthStateRecord, HealthStateRecord, HealthStateRecordFilters,
};
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::{AppError, AppResult};
use crate::repo::{health_state_records, pets};
use chrono_tz::Tz;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &ServiceContext,
    filters: HealthStateRecordFilters,
) -> AppResult<Vec<HealthStateRecord>> {
    health_state_records::list_scoped(
        pool,
        &filters,
        &pool.visibility_str(filters.pet_id.as_deref()).await?,
    )
    .await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &ServiceContext,
    req: CreateHealthStateRecord,
    _timezone: Tz,
) -> AppResult<HealthStateRecord> {
    let authorized_pet = pool
        .check_str(&req.pet_id, ResourceAction::WriteRecords)
        .await?;
    let timezone = pool.timezone(authorized_pet).await?;
    let mut req = req;
    if req.occurred_at.is_none() {
        req.occurred_at = Some(pool.local_timestamp(timezone, req.local_date.as_deref()));
    }

    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    health_state_records::create(pool, req, timezone).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &ServiceContext, id: &str) -> AppResult<()> {
    let owner = health_state_records::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    health_state_records::delete(pool, id).await
}
