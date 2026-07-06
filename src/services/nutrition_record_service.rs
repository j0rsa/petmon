use crate::domain::nutrition_record::{
    CreateNutritionRecord, NutritionRecord, NutritionRecordFilters, UpdateNutritionRecord,
};
use crate::error::{AppError, AppResult};
use crate::repo::{nutrition_records, pets};
use crate::services::telegram;
use chrono_tz::Tz;
use sqlx::SqlitePool;
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
    pool: &SqlitePool,
    filters: NutritionRecordFilters,
) -> AppResult<Vec<NutritionRecord>> {
    nutrition_records::list_records(pool, &filters).await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<NutritionRecord> {
    nutrition_records::get_record(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &SqlitePool,
    req: CreateNutritionRecord,
    timezone: Tz,
) -> AppResult<NutritionRecord> {
    validate_create(&req)?;
    pets::get_pet(pool, req.pet_id).await?;
    let record = NutritionRecord::new(req, timezone);
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
    pool: &SqlitePool,
    records: Vec<CreateNutritionRecord>,
    timezone: Tz,
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
        pets::get_pet(pool, pet_id).await?;
    }

    let created: Vec<NutritionRecord> = records
        .into_iter()
        .map(|r| NutritionRecord::new(r, timezone))
        .collect();
    nutrition_records::create_records_batch(pool, created).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    req: UpdateNutritionRecord,
) -> AppResult<NutritionRecord> {
    if let Some(amount) = req.amount {
        if amount < 0.0 {
            return Err(AppError::Validation {
                field: "amount".to_string(),
                message: "Amount must be non-negative".to_string(),
            });
        }
    }
    nutrition_records::update_record(pool, id, req).await?;
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
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    nutrition_records::delete_record(pool, id).await
}
