use crate::domain::analytics::{BestFluidDay, FluidCurvePoint, NutritionDailyTotal};
use crate::domain::nutrition_record::NutritionRecordFilters;
use crate::error::AppResult;
use crate::repo::nutrition_records;
use sqlx::SqlitePool;
use std::collections::BTreeMap;
use uuid::Uuid;

pub async fn daily_totals(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
    pet_id: Option<Uuid>,
    category: Option<&str>,
) -> AppResult<Vec<NutritionDailyTotal>> {
    let mut query = String::from(
        "SELECT local_date, pet_id, category, SUM(amount) as total_amount, COUNT(*) as record_count FROM nutrition_records WHERE local_date >= ? AND local_date <= ?",
    );
    if pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    if category.is_some() {
        query.push_str(" AND category = ?");
    }
    query.push_str(" GROUP BY local_date, pet_id, category ORDER BY local_date, category");

    let mut q = sqlx::query_as::<_, NutritionDailyTotal>(&query)
        .bind(date_from)
        .bind(date_to);
    if let Some(pet_id) = pet_id {
        q = q.bind(pet_id);
    }
    if let Some(category) = category {
        q = q.bind(category);
    }
    Ok(q.fetch_all(pool).await?)
}

#[derive(sqlx::FromRow)]
struct BestDayRow {
    local_date: String,
    total_fluid_ml: f64,
}

pub async fn best_fluid_day(
    pool: &SqlitePool,
    pet_id: Option<Uuid>,
    exclude_date: &str,
) -> AppResult<Option<BestFluidDay>> {
    let mut query = String::from(
        "SELECT local_date, SUM(CASE WHEN category = 'wet_food' THEN amount * 0.77 WHEN category IN ('water', 'liquids') THEN amount ELSE 0 END) AS total_fluid_ml FROM nutrition_records WHERE local_date != ?",
    );
    if pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    query.push_str(" GROUP BY local_date ORDER BY total_fluid_ml DESC LIMIT 1");

    let mut q = sqlx::query_as::<_, BestDayRow>(&query).bind(exclude_date);
    if let Some(id) = pet_id {
        q = q.bind(id);
    }

    let row = q.fetch_optional(pool).await?;
    match row {
        None => Ok(None),
        Some(r) => {
            let filters = NutritionRecordFilters {
                pet_id,
                date: Some(r.local_date.clone()),
                date_from: None,
                date_to: None,
                category: None,
                limit: None,
                offset: None,
            };
            let records = nutrition_records::list_records(pool, &filters).await?;

            // Build a cumulative fluid curve keyed by HH:MM (sorted).
            // Only fluid-contributing categories: water, liquids (direct), wet_food (× 0.77).
            let mut by_time: BTreeMap<String, f64> = BTreeMap::new();
            for rec in &records {
                use crate::domain::nutrition_record::NutritionCategory;
                let fluid = match rec.category {
                    NutritionCategory::Water | NutritionCategory::Liquids => rec.amount,
                    NutritionCategory::WetFood => rec.amount * 0.77,
                    NutritionCategory::DryFood => 0.0,
                };
                if fluid == 0.0 {
                    continue;
                }
                // Extract HH:MM from the occurred_at timestamp
                let time = rec.occurred_at.chars().skip(11).take(5).collect::<String>();
                *by_time.entry(time).or_insert(0.0) += fluid;
            }

            let mut cumulative = 0.0;
            let mut curve: Vec<FluidCurvePoint> = Vec::with_capacity(by_time.len() + 1);
            for (time, fluid) in by_time {
                cumulative += fluid;
                curve.push(FluidCurvePoint {
                    time,
                    cumulative_fluid_ml: (cumulative * 10.0).round() / 10.0,
                });
            }

            Ok(Some(BestFluidDay {
                local_date: r.local_date,
                total_fluid_ml: r.total_fluid_ml,
                curve,
            }))
        }
    }
}
