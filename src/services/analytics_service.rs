use crate::domain::analytics::{DailyTotal, RangeSummary};
use crate::error::AppResult;
use crate::repo::analytics;
use sqlx::SqlitePool;
use std::collections::HashMap;

#[tracing::instrument(skip(pool))]
pub async fn daily_totals(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
    cat_id: Option<&str>,
    category: Option<&str>,
) -> AppResult<Vec<DailyTotal>> {
    analytics::daily_totals(pool, date_from, date_to, cat_id, category).await
}

#[tracing::instrument(skip(pool))]
pub async fn range_summary(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
    cat_id: Option<&str>,
    category: Option<&str>,
) -> AppResult<RangeSummary> {
    let daily_totals = analytics::daily_totals(pool, date_from, date_to, cat_id, category).await?;
    let mut category_sums: HashMap<String, (f64, usize)> = HashMap::new();
    for dt in &daily_totals {
        let e = category_sums.entry(dt.category.clone()).or_insert((0.0, 0));
        e.0 += dt.total_amount;
        e.1 += 1;
    }
    let category_averages = category_sums
        .into_iter()
        .map(|(k, (sum, count))| (k, if count > 0 { sum / count as f64 } else { 0.0 }))
        .collect();
    Ok(RangeSummary {
        date_from: date_from.to_string(),
        date_to: date_to.to_string(),
        cat_id: cat_id.map(ToOwned::to_owned),
        daily_totals,
        category_averages,
    })
}
