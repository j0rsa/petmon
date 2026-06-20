use crate::domain::elimination::EliminationRangeSummary;
use crate::error::AppResult;
use crate::repo::elimination_analytics;
use sqlx::SqlitePool;
use std::collections::HashMap;

#[tracing::instrument(skip(pool))]
pub async fn range_summary(
    pool: &SqlitePool,
    pet_id: Option<&str>,
    date_from: &str,
    date_to: &str,
) -> AppResult<EliminationRangeSummary> {
    let daily_summaries =
        elimination_analytics::daily_summaries(pool, pet_id, date_from, date_to).await?;

    // Compute type_totals
    let mut type_totals: HashMap<String, i64> = HashMap::new();
    let mut total_sum: i64 = 0;
    for s in &daily_summaries {
        *type_totals.entry("urination".to_string()).or_insert(0) += s.urination_count;
        *type_totals.entry("defecation".to_string()).or_insert(0) += s.defecation_count;
        *type_totals.entry("vomit".to_string()).or_insert(0) += s.vomit_count;
        *type_totals.entry("general".to_string()).or_insert(0) += s.general_count;
        total_sum += s.total_count;
    }

    let n = daily_summaries.len();
    let avg_per_day = if n > 0 {
        total_sum as f64 / n as f64
    } else {
        0.0
    };

    // Percentiles from sorted daily total_counts
    let mut counts: Vec<i64> = daily_summaries.iter().map(|s| s.total_count).collect();
    counts.sort_unstable();

    let percentile = |p: f64| -> f64 {
        if counts.is_empty() {
            return 0.0;
        }
        let idx = ((counts.len() as f64 * p) as usize).min(counts.len() - 1);
        counts[idx] as f64
    };

    let p50_per_day = percentile(0.5);
    let p90_per_day = percentile(0.9);
    let p99_per_day = percentile(0.99);

    Ok(EliminationRangeSummary {
        date_from: date_from.to_string(),
        date_to: date_to.to_string(),
        pet_id: pet_id.map(str::to_owned),
        daily_summaries,
        type_totals,
        avg_per_day,
        p50_per_day,
        p90_per_day,
        p99_per_day,
    })
}
