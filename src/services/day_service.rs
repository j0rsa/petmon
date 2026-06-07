use crate::domain::analytics::DaySummary;
use crate::domain::entry::EntryFilters;
use crate::error::AppResult;
use crate::repo::{day_notes, entries};
use sqlx::SqlitePool;
use std::collections::HashMap;

#[tracing::instrument(skip(pool))]
pub async fn get_day_summary(pool: &SqlitePool, date: &str, cat_id: Option<&str>) -> AppResult<DaySummary> {
    let filters = EntryFilters {
        cat_id: cat_id.map(ToOwned::to_owned),
        date: Some(date.to_string()),
        date_from: None,
        date_to: None,
        category: None,
        limit: None,
        offset: None,
    };
    let entries = entries::list_entries(pool, &filters).await?;
    let mut totals_by_category: HashMap<String, f64> = HashMap::new();
    for entry in &entries {
        *totals_by_category.entry(entry.category.clone()).or_insert(0.0) += entry.amount;
    }
    let note = day_notes::get_day_note(pool, date, cat_id).await?.map(|n| n.note);
    Ok(DaySummary {
        local_date: date.to_string(),
        cat_id: cat_id.map(ToOwned::to_owned),
        entries,
        totals_by_category,
        note,
    })
}

#[tracing::instrument(skip(pool))]
pub async fn update_day_note(pool: &SqlitePool, date: &str, cat_id: Option<&str>, note: &str) -> AppResult<()> {
    day_notes::upsert_day_note(pool, date, cat_id, note).await?;
    Ok(())
}