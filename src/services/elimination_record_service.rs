use crate::domain::elimination::{
    CreateEliminationRecord, CreateEliminationWithWeight, EliminationEventType, EliminationRecord,
    EliminationRecordFilters, EliminationWithWeightCreated, UpdateEliminationRecord,
};
use crate::domain::weight::CreateWeightRecord;
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::{AppError, AppResult};
use crate::repo::{elimination_records, pets, weight_records};
use crate::services::{elimination_auto_categorize, elimination_classifier, notification_service};
use chrono_tz::Tz;
use uuid::Uuid;

/// Stamp now when `occurred_at` is omitted. If `local_date` is set (journal day),
/// keep that date and use the current time-of-day so a blank Time field still
/// lands on the day the user is looking at.
fn resolve_occurred_at(
    context: &ServiceContext,
    occurred_at: Option<&str>,
    local_date: Option<&str>,
    timezone: Tz,
) -> AppResult<crate::record_time::RecordTime> {
    crate::record_time::resolve(occurred_at, local_date, timezone, context.runtime.now())
}

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &ServiceContext,
    filters: EliminationRecordFilters,
) -> AppResult<Vec<EliminationRecord>> {
    elimination_records::list_scoped(
        pool,
        &filters,
        &pool.visibility_str(filters.pet_id.as_deref()).await?,
    )
    .await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &ServiceContext, id: &str) -> AppResult<EliminationRecord> {
    let owner = elimination_records::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::View).await?;

    elimination_records::get(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &ServiceContext,
    req: CreateEliminationRecord,
    _timezone: Tz,
) -> AppResult<EliminationRecord> {
    let authorized_pet = pool
        .check_str(&req.pet_id, ResourceAction::WriteRecords)
        .await?;
    let timezone = pool.timezone(authorized_pet).await?;

    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    let pet = pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    let occurred_at = resolve_occurred_at(
        pool,
        req.occurred_at.as_deref(),
        req.local_date.as_deref(),
        timezone,
    )?;

    let attempt = elimination_auto_categorize::attempt_auto_categorize(
        pool,
        pet_id,
        req.event_type,
        req.duration_seconds,
        &occurred_at.utc,
    )
    .await?;

    let mut req = req;
    req.event_type = attempt.event_type;
    req.occurred_at = Some(occurred_at.utc);
    req.local_date = Some(occurred_at.local_date);

    let record = elimination_records::create(
        pool,
        req,
        timezone,
        attempt.is_auto_categorized,
        attempt.auto_categorize_confidence,
    )
    .await?;

    if let Some(reason) = attempt.failure {
        notification_service::notify_elimination_auto_categorize_failed(
            pool, &record, &pet.name, reason,
        )
        .await?;
    }

    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn create_with_weight(
    pool: &ServiceContext,
    req: CreateEliminationWithWeight,
    _timezone: Tz,
) -> AppResult<EliminationWithWeightCreated> {
    let authorized_pet = pool
        .check_str(&req.pet_id, ResourceAction::WriteRecords)
        .await?;
    let timezone = pool.timezone(authorized_pet).await?;

    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    let occurred_at = resolve_occurred_at(
        pool,
        req.occurred_at.as_deref(),
        req.local_date.as_deref(),
        timezone,
    )?;
    let local_date = occurred_at.local_date;
    let occurred_at = occurred_at.utc;

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
    pool: &ServiceContext,
    id: &str,
    req: UpdateEliminationRecord,
) -> AppResult<EliminationRecord> {
    let owner = elimination_records::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    let existing = elimination_records::get(pool, id).await?;
    let event_type_changed =
        req.event_type.is_some() && req.event_type != Some(existing.event_type);
    let record =
        elimination_records::update(pool, id, req, pool.timezone(owner.pet_id).await?).await?;
    if event_type_changed {
        elimination_classifier::mark_pending_retrain(pool, record.pet_id).await?;
    }
    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &ServiceContext, id: &str) -> AppResult<()> {
    let owner = elimination_records::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    elimination_records::delete(pool, id).await
}
