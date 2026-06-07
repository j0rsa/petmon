use crate::domain::analytics::DailyTotal;
use crate::error::AppResult;
use sqlx::SqlitePool;

pub async fn daily_totals(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
    cat_id: Option<&str>,
    category: Option<&str>,
) -> AppResult<Vec<DailyTotal>> {
    let mut query = String::from(
        "SELECT local_date, cat_id, category, SUM(amount) as total_amount, COUNT(*) as entry_count FROM entries WHERE local_date >= ? AND local_date <= ?",
    );
    if cat_id.is_some() {
        query.push_str(" AND cat_id = ?");
    }
    if category.is_some() {
        query.push_str(" AND category = ?");
    }
    query.push_str(" GROUP BY local_date, cat_id, category ORDER BY local_date, category");

    let mut q = sqlx::query_as::<_, DailyTotal>(&query).bind(date_from).bind(date_to);
    if let Some(cat_id) = cat_id {
        q = q.bind(cat_id);
    }
    if let Some(category) = category {
        q = q.bind(category);
    }
    Ok(q.fetch_all(pool).await?)
}
