use crate::domain::analytics::NutritionDailyTotal;
use crate::error::AppResult;
use sqlx::SqlitePool;
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

    let mut q = sqlx::query_as::<_, NutritionDailyTotal>(&query).bind(date_from).bind(date_to);
    if let Some(pet_id) = pet_id {
        q = q.bind(pet_id);
    }
    if let Some(category) = category {
        q = q.bind(category);
    }
    Ok(q.fetch_all(pool).await?)
}
