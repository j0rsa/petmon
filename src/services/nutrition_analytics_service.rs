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
    let Some(day) = nutrition_analytics::best_fluid_day_records_scoped(
        pool,
        pet_id,
        exclude_date,
        &pool.visibility(pet_id).await?,
    )
    .await?
    else {
        return Ok(None);
    };
    let mut timezones = HashMap::new();
    let mut by_time = std::collections::BTreeMap::<String, (f64, f64)>::new();
    for record in day.records {
        let timezone = match timezones.get(&record.pet_id) {
            Some(timezone) => *timezone,
            None => {
                let timezone = pool.timezone(record.pet_id).await?;
                timezones.insert(record.pet_id, timezone);
                timezone
            }
        };
        use crate::domain::nutrition_record::NutritionCategory;
        let (fluid, liquid) = match record.category {
            NutritionCategory::Water | NutritionCategory::Liquids => (record.amount, record.amount),
            NutritionCategory::WetFood => (record.amount * 0.77, 0.0),
            NutritionCategory::DryFood => (0.0, 0.0),
        };
        if fluid == 0.0 {
            continue;
        }
        let time = crate::record_time::local_datetime(&record.occurred_at, timezone)?
            .format("%H:%M")
            .to_string();
        let entry = by_time.entry(time).or_default();
        entry.0 += fluid;
        entry.1 += liquid;
    }
    let (mut fluid, mut liquids) = (0.0, 0.0);
    let curve = by_time
        .into_iter()
        .map(|(time, amounts)| {
            fluid += amounts.0;
            liquids += amounts.1;
            crate::domain::analytics::FluidCurvePoint {
                time,
                cumulative_fluid_ml: (fluid * 10.0).round() / 10.0,
                cumulative_liquids_ml: (liquids * 10.0).round() / 10.0,
            }
        })
        .collect();
    Ok(Some(BestFluidDay {
        local_date: day.local_date,
        total_fluid_ml: day.total_fluid_ml,
        curve,
    }))
}
