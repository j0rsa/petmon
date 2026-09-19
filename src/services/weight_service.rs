use crate::domain::weight::{
    summarize_by_tag, CreateWeightRecord, UpdateWeightRecord, WeightGroupBy, WeightRecord,
    WeightRecordFilters, WeightStats, WeightTagCount,
};
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::{AppError, AppResult};
use crate::repo::{pets, weight_records};
use chrono_tz::Tz;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &ServiceContext,
    filters: WeightRecordFilters,
) -> AppResult<Vec<WeightRecord>> {
    weight_records::list_scoped(
        pool,
        &filters,
        &pool.visibility_str(filters.pet_id.as_deref()).await?,
    )
    .await
}

#[tracing::instrument(skip(pool))]
pub async fn list_tags(pool: &ServiceContext, pet_id: &str) -> AppResult<Vec<WeightTagCount>> {
    pool.check_str(pet_id, ResourceAction::View).await?;

    weight_records::list_tags(pool, pet_id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &ServiceContext,
    req: CreateWeightRecord,
    _timezone: Tz,
) -> AppResult<WeightRecord> {
    let authorized_pet = pool
        .check_str(&req.pet_id, ResourceAction::WriteRecords)
        .await?;
    let timezone = pool.timezone(authorized_pet).await?;
    let mut req = req;
    if req.measured_at.is_none() {
        req.measured_at = Some(pool.local_timestamp(timezone, req.local_date.as_deref()));
    }

    // Validate pet exists
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;

    let weight_kg = req.weight_kg;
    let pet_id_str = req.pet_id.clone();
    let record = weight_records::create(pool, req, timezone).await?;

    // Update the pet's current weight
    pets::update_weight(pool, &pet_id_str, weight_kg).await?;

    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn stats(
    pool: &ServiceContext,
    pet_id: &str,
    date_from: &str,
    date_to: &str,
) -> AppResult<WeightStats> {
    pool.check_str(pet_id, ResourceAction::View).await?;

    weight_records::stats(pool, pet_id, date_from, date_to).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(
    pool: &ServiceContext,
    id: &str,
    req: UpdateWeightRecord,
) -> AppResult<WeightRecord> {
    let owner = weight_records::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    weight_records::update(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &ServiceContext, id: &str) -> AppResult<()> {
    let owner = weight_records::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    weight_records::delete(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn summary(
    pool: &ServiceContext,
    pet_id: &str,
    date_from: Option<&str>,
    date_to: &str,
    granularity: &crate::domain::weight::WeightGranularity,
    group_by: &WeightGroupBy,
) -> AppResult<Vec<crate::domain::weight::WeightSummaryBucket>> {
    pool.check_str(pet_id, ResourceAction::View).await?;

    match group_by {
        WeightGroupBy::None => {
            weight_records::summary(pool, pet_id, date_from, date_to, granularity).await
        }
        WeightGroupBy::Tag => {
            let records = weight_records::list(
                pool,
                &WeightRecordFilters {
                    pet_id: Some(pet_id.to_string()),
                    date_from: date_from.map(str::to_string),
                    date_to: Some(date_to.to_string()),
                    limit: None,
                    offset: None,
                    tags: None,
                },
            )
            .await?;
            Ok(summarize_by_tag(&records, granularity))
        }
    }
}
