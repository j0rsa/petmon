use crate::domain::analytics::NutritionDaySummary;
use crate::domain::nutrition_record::NutritionRecordFilters;
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::AppResult;
use crate::repo::{day_notes, nutrition_records};
use std::collections::HashMap;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn get_day_summary(
    pool: &ServiceContext,
    date: &str,
    pet_id: Option<Uuid>,
) -> AppResult<NutritionDaySummary> {
    pool.check(pet_id, ResourceAction::View).await?;

    let filters = NutritionRecordFilters {
        pet_id,
        date: Some(date.to_string()),
        date_from: None,
        date_to: None,
        category: None,
        limit: None,
        offset: None,
    };
    let records =
        nutrition_records::list_records_scoped(pool, &filters, &pool.visibility(pet_id).await?)
            .await?;
    let mut totals_by_category: HashMap<String, f64> = HashMap::new();
    for record in &records {
        *totals_by_category
            .entry(record.category.to_string())
            .or_insert(0.0) += record.amount;
    }
    let note = day_notes::get_day_note(pool, date, pet_id)
        .await?
        .map(|n| n.note);
    Ok(NutritionDaySummary {
        local_date: date.to_string(),
        pet_id,
        records,
        totals_by_category,
        note,
    })
}

#[tracing::instrument(skip(pool))]
pub async fn update_day_note(
    pool: &ServiceContext,
    date: &str,
    pet_id: Option<Uuid>,
    note: &str,
) -> AppResult<()> {
    pool.check(pet_id, ResourceAction::WriteRecords).await?;

    day_notes::upsert_day_note(pool, date, pet_id, note).await?;
    Ok(())
}

pub async fn get_note(
    context: &ServiceContext,
    date: &str,
    pet_id: Option<Uuid>,
) -> AppResult<Option<day_notes::DayNote>> {
    context.check(pet_id, ResourceAction::View).await?;
    day_notes::get_day_note(context, date, pet_id).await
}

pub async fn write_note(
    context: &ServiceContext,
    date: &str,
    pet_id: Option<Uuid>,
    note: &str,
) -> AppResult<day_notes::DayNote> {
    context.check(pet_id, ResourceAction::WriteRecords).await?;
    day_notes::upsert_day_note(context, date, pet_id, note).await
}
