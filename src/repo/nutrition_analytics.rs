use crate::domain::analytics::NutritionDailyTotal;
use crate::domain::nutrition_record::NutritionRecordFilters;
use crate::error::AppResult;
use crate::repo::nutrition_records;
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn daily_totals(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
    pet_id: Option<Uuid>,
    category: Option<&str>,
) -> AppResult<Vec<NutritionDailyTotal>> {
    daily_totals_scoped(
        pool,
        date_from,
        date_to,
        pet_id,
        category,
        &crate::embedding::PetVisibility::All,
    )
    .await
}

pub async fn daily_totals_scoped(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
    pet_id: Option<Uuid>,
    category: Option<&str>,
    visibility: &crate::embedding::PetVisibility,
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
    query.push_str(&format!(" AND {}", visibility.predicate("pet_id")));
    query.push_str(" GROUP BY local_date, pet_id, category ORDER BY local_date, category");

    let mut q = sqlx::query_as::<_, NutritionDailyTotal>(sqlx::AssertSqlSafe(query))
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

pub struct BestFluidDayRecords {
    pub local_date: String,
    pub total_fluid_ml: f64,
    pub records: Vec<crate::domain::nutrition_record::NutritionRecord>,
}

/// Select the winning journal day and its visible records. Presentation in each
/// actor's timezone belongs to the service, not UTC-string slicing in SQL.
pub async fn best_fluid_day_records_scoped(
    pool: &SqlitePool,
    pet_id: Option<Uuid>,
    exclude_date: &str,
    visibility: &crate::embedding::PetVisibility,
) -> AppResult<Option<BestFluidDayRecords>> {
    let mut query = String::from(
        "SELECT local_date, SUM(CASE WHEN category = 'wet_food' THEN amount * 0.77 WHEN category IN ('water', 'liquids') THEN amount ELSE 0 END) AS total_fluid_ml FROM nutrition_records WHERE local_date != ?",
    );
    if pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    query.push_str(&format!(" AND {}", visibility.predicate("pet_id")));
    query.push_str(" GROUP BY local_date ORDER BY total_fluid_ml DESC LIMIT 1");
    let mut q = sqlx::query_as::<_, BestDayRow>(sqlx::AssertSqlSafe(query)).bind(exclude_date);
    if let Some(id) = pet_id {
        q = q.bind(id);
    }
    let Some(row) = q.fetch_optional(pool).await? else {
        return Ok(None);
    };
    let records = nutrition_records::list_records_scoped(
        pool,
        &NutritionRecordFilters {
            pet_id,
            date: Some(row.local_date.clone()),
            date_from: None,
            date_to: None,
            category: None,
            limit: None,
            offset: None,
        },
        visibility,
    )
    .await?;
    Ok(Some(BestFluidDayRecords {
        local_date: row.local_date,
        total_fluid_ml: row.total_fluid_ml,
        records,
    }))
}
