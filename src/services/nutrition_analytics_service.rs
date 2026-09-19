use crate::domain::analytics::{BestFluidDay, NutritionDailyTotal, NutritionRangeSummary};
use crate::embedding::ServiceContext;
use crate::error::AppResult;
use crate::repo::nutrition_analytics;
use std::collections::HashMap;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn daily_totals(
    pool: &ServiceContext,
    date_from: &str,
    date_to: &str,
    pet_id: Option<Uuid>,
    category: Option<&str>,
) -> AppResult<Vec<NutritionDailyTotal>> {
    nutrition_analytics::daily_totals_scoped(
        pool,
        date_from,
        date_to,
        pet_id,
        category,
        &pool.visibility(pet_id).await?,
    )
    .await
}

#[tracing::instrument(skip(pool))]
pub async fn range_summary(
    pool: &ServiceContext,
    date_from: &str,
    date_to: &str,
    pet_id: Option<Uuid>,
    category: Option<&str>,
) -> AppResult<NutritionRangeSummary> {
    let daily_totals = nutrition_analytics::daily_totals_scoped(
        pool,
        date_from,
        date_to,
        pet_id,
        category,
        &pool.visibility(pet_id).await?,
    )
    .await?;
    let mut category_sums: HashMap<String, (f64, usize)> = HashMap::new();
    for total in &daily_totals {
        let entry = category_sums
            .entry(total.category.clone())
            .or_insert((0.0, 0));
        entry.0 += total.total_amount;
        entry.1 += 1;
    }
    let category_averages = category_sums
        .into_iter()
        .map(|(k, (sum, count))| (k, if count > 0 { sum / count as f64 } else { 0.0 }))
        .collect();
    Ok(NutritionRangeSummary {
        date_from: date_from.to_string(),
        date_to: date_to.to_string(),
        pet_id,
        daily_totals,
        category_averages,
    })
}

#[tracing::instrument(skip(pool))]
pub async fn best_fluid_day(
    pool: &ServiceContext,
    pet_id: Option<Uuid>,
    exclude_date: &str,
) -> AppResult<Option<BestFluidDay>> {
    nutrition_analytics::best_fluid_day_scoped(
        pool,
        pet_id,
        exclude_date,
        &pool.visibility(pet_id).await?,
    )
    .await
}
