use crate::domain::elimination::{
    CreateEliminationRecord, CreateEliminationWithWeight, EliminationEventType, EliminationRecord,
    EliminationRecordFilters, EliminationWithWeightCreated, UpdateEliminationRecord,
};
use crate::domain::weight::CreateWeightRecord;
use crate::error::{AppError, AppResult};
use crate::repo::{elimination_records, pets, weight_records};
use crate::services::elimination_auto_categorize;
use chrono::Utc;
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

    let event_type = elimination_auto_categorize::maybe_auto_categorize(
        pool,
        pet_id,
        req.event_type,
        req.duration_seconds,
    )
    .await?;

    let mut req = req;
    req.event_type = event_type;

    elimination_records::create(pool, req, timezone).await
}

#[tracing::instrument(skip(pool))]
pub async fn create_with_weight(
    pool: &SqlitePool,
    req: CreateEliminationWithWeight,
    timezone: Tz,
) -> AppResult<EliminationWithWeightCreated> {
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    // Resolve the shared timestamp once so both records land at exactly the same moment.
    let occurred_at = req.occurred_at.unwrap_or_else(|| {
        Utc::now()
            .with_timezone(&timezone)
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    });
    let local_date = req
        .local_date
        .unwrap_or_else(|| occurred_at.split('T').next().unwrap_or("").to_string());

    let elim_req = CreateEliminationRecord {
        pet_id: req.pet_id.clone(),
        occurred_at: Some(occurred_at.clone()),
        local_date: Some(local_date.clone()),
        event_type: req.event_type.unwrap_or(EliminationEventType::General),
        subtype: req.subtype,
        duration_seconds: req.duration_seconds,
        note: req.note,
        source_type: req.source_type.clone(),
    };
    let weight_req = CreateWeightRecord {
        pet_id: req.pet_id.clone(),
        measured_at: Some(occurred_at),
        local_date: Some(local_date),
        weight_kg: req.weight_kg,
        note: req.weight_note,
        source_type: req.source_type,
    };

    let elimination = create(pool, elim_req, timezone).await?;
    let weight = weight_records::create(pool, weight_req, timezone).await?;
    pets::update_weight(pool, &req.pet_id, req.weight_kg).await?;

    Ok(EliminationWithWeightCreated {
        elimination,
        weight,
    })
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
