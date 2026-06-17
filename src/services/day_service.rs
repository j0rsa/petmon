use crate::domain::analytics::NutritionDaySummary;
use crate::domain::nutrition_record::NutritionRecordFilters;
use crate::error::AppResult;
use crate::repo::{day_notes, nutrition_records};
use sqlx::SqlitePool;
use std::collections::HashMap;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn get_day_summary(
    pool: &SqlitePool,
    date: &str,
    pet_id: Option<Uuid>,
) -> AppResult<NutritionDaySummary> {
    let filters = NutritionRecordFilters {
        pet_id,
        date: Some(date.to_string()),
        date_from: None,
        date_to: None,
        category: None,
        limit: None,
        offset: None,
    };
    let records = nutrition_records::list_records(pool, &filters).await?;
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
    pool: &SqlitePool,
    date: &str,
    pet_id: Option<Uuid>,
    note: &str,
) -> AppResult<()> {
    day_notes::upsert_day_note(pool, date, pet_id, note).await?;
    Ok(())
}
