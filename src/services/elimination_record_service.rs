use crate::domain::elimination::{
    CreateEliminationRecord, CreateEliminationWithWeight, EliminationEventType, EliminationRecord,
    EliminationRecordFilters, EliminationWithWeightCreated, UpdateEliminationRecord,
};
use crate::domain::weight::CreateWeightRecord;
use crate::error::{AppError, AppResult};
use crate::repo::{elimination_records, pets, weight_records};
use crate::services::{elimination_auto_categorize, elimination_classifier, notification_service};
use chrono::Utc;
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

fn resolve_occurred_at(req: &CreateEliminationRecord, timezone: Tz) -> String {
    req.occurred_at.clone().unwrap_or_else(|| {
        Utc::now()
            .with_timezone(&timezone)
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    })
}

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
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    let pet = pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    let occurred_at = resolve_occurred_at(&req, timezone);

    let attempt = elimination_auto_categorize::attempt_auto_categorize(
        pool,
        pet_id,
        req.event_type,
        req.duration_seconds,
        &occurred_at,
    )
    .await?;

    let mut req = req;
    req.event_type = attempt.event_type;
    if req.occurred_at.is_none() {
        req.occurred_at = Some(occurred_at);
    }

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
    pool: &SqlitePool,
    req: CreateEliminationWithWeight,
    timezone: Tz,
) -> AppResult<EliminationWithWeightCreated> {
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    let occurred_at = req.occurred_at.clone().unwrap_or_else(|| {
        Utc::now()
            .with_timezone(&timezone)
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    });
    let local_date = req
        .local_date
        .clone()
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
    let existing = elimination_records::get(pool, id).await?;
    let event_type_changed =
        req.event_type.is_some() && req.event_type != Some(existing.event_type);
    let record = elimination_records::update(pool, id, req).await?;
    if event_type_changed {
        elimination_classifier::mark_pending_retrain(pool, record.pet_id).await?;
    }
    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    elimination_records::delete(pool, id).await
}
