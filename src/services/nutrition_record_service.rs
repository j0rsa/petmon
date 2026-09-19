use crate::domain::nutrition_record::{
    CreateNutritionRecord, NutritionRecord, NutritionRecordFilters, UpdateNutritionRecord,
};
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::{AppError, AppResult};
use crate::repo::{nutrition_records, pets};
use crate::services::telegram;
use chrono_tz::Tz;
use std::collections::HashSet;
use tracing::Instrument;

const MAX_BATCH_SIZE: usize = 2000;

fn validate_create(req: &CreateNutritionRecord) -> AppResult<()> {
    if req.amount < 0.0 {
        return Err(AppError::Validation {
            field: "amount".to_string(),
            message: "Amount must be non-negative".to_string(),
        });
    }
    Ok(())
}

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &ServiceContext,
    filters: NutritionRecordFilters,
) -> AppResult<Vec<NutritionRecord>> {
    nutrition_records::list_records_scoped(pool, &filters, &pool.visibility(filters.pet_id).await?)
        .await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &ServiceContext, id: &str) -> AppResult<NutritionRecord> {
    let owner = nutrition_records::get_record(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::View).await?;

    nutrition_records::get_record(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &ServiceContext,
    req: CreateNutritionRecord,
    _timezone: Tz,
) -> AppResult<NutritionRecord> {
    pool.check(Some(req.pet_id), ResourceAction::WriteRecords)
        .await?;
    let timezone = pool.timezone(req.pet_id).await?;

    validate_create(&req)?;
    pets::get_pet(pool, req.pet_id).await?;
    let mut req = req;
    if req.occurred_at.is_none() {
        req.occurred_at = Some(pool.local_timestamp(timezone, req.local_date.as_deref()));
    }
    let record = NutritionRecord::new(req, timezone)?;
    let record = nutrition_records::create_record(pool, record).await?;

    let pool2 = pool.clone();
    let record2 = record.clone();
    tokio::spawn(
        async move { telegram::notify_record(&pool2, &record2).await }
            .instrument(tracing::Span::current()),
    );

    Ok(record)
}

#[tracing::instrument(skip(pool, records))]
pub async fn batch_create(
    pool: &ServiceContext,
    records: Vec<CreateNutritionRecord>,
    _timezone: Tz,
) -> AppResult<Vec<NutritionRecord>> {
    if records.is_empty() {
        return Err(AppError::Validation {
            field: "records".to_string(),
            message: "At least one record is required".to_string(),
        });
    }
    if records.len() > MAX_BATCH_SIZE {
        return Err(AppError::Validation {
            field: "records".to_string(),
            message: format!("Batch size cannot exceed {MAX_BATCH_SIZE} records"),
        });
    }

    let mut pet_ids = HashSet::new();
    for req in &records {
        validate_create(req)?;
        pet_ids.insert(req.pet_id);
    }
    for pet_id in pet_ids {
        pool.check(Some(pet_id), ResourceAction::WriteRecords)
            .await?;
        pets::get_pet(pool, pet_id).await?;
    }

    let mut created = Vec::with_capacity(records.len());
    for mut req in records {
        let timezone = pool.timezone(req.pet_id).await?;
        if req.occurred_at.is_none() {
            req.occurred_at = Some(pool.local_timestamp(timezone, req.local_date.as_deref()));
        }
        created.push(NutritionRecord::new(req, timezone)?);
    }
    nutrition_records::create_records_batch(pool, created).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(
    pool: &ServiceContext,
    id: &str,
    req: UpdateNutritionRecord,
) -> AppResult<NutritionRecord> {
    let owner = nutrition_records::get_record(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    if let Some(amount) = req.amount {
        if amount < 0.0 {
            return Err(AppError::Validation {
                field: "amount".to_string(),
                message: "Amount must be non-negative".to_string(),
            });
        }
    }
    nutrition_records::update_record(pool, id, req, pool.timezone(owner.pet_id).await?).await?;
    let record = nutrition_records::get_record(pool, id).await?;

    let pool2 = pool.clone();
    let record2 = record.clone();
    tokio::spawn(
        async move { telegram::notify_record_update(&pool2, &record2).await }
            .instrument(tracing::Span::current()),
    );

    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &ServiceContext, id: &str) -> AppResult<()> {
    let owner = nutrition_records::get_record(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    let record = nutrition_records::get_record(pool, id).await?;
    nutrition_records::delete_record(pool, id).await?;

    if record.telegram_message_id.is_some() {
        let pool2 = pool.clone();
        tokio::spawn(
            async move { telegram::notify_record_delete(&pool2, &record).await }
                .instrument(tracing::Span::current()),
        );
    }

    Ok(())
}
