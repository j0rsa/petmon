use crate::domain::schedule::{Schedule, UpdateSchedule};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn list_schedules(pool: &SqlitePool, cat_id: Option<&str>) -> AppResult<Vec<Schedule>> {
    let mut query = String::from(
        "SELECT id, cat_id, name, active, rules_json, created_at, updated_at FROM schedules",
    );
    if cat_id.is_some() {
        query.push_str(" WHERE cat_id = ?");
    }
    query.push_str(" ORDER BY name");
    let mut q = sqlx::query_as::<_, Schedule>(&query);
    if let Some(cat_id) = cat_id {
        q = q.bind(cat_id);
    }
    Ok(q.fetch_all(pool).await?)
}

pub async fn get_schedule(pool: &SqlitePool, id: &str) -> AppResult<Schedule> {
    let schedule = sqlx::query_as::<_, Schedule>(
        "SELECT id, cat_id, name, active, rules_json, created_at, updated_at FROM schedules WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Schedule {id} not found")))?;
    Ok(schedule)
}

pub async fn create_schedule(pool: &SqlitePool, schedule: Schedule) -> AppResult<Schedule> {
    let active_i = if schedule.active { 1_i64 } else { 0_i64 };
    sqlx::query(
        "INSERT INTO schedules (id, cat_id, name, active, rules_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&schedule.id)
    .bind(&schedule.cat_id)
    .bind(&schedule.name)
    .bind(active_i)
    .bind(&schedule.rules_json)
    .bind(&schedule.created_at)
    .bind(&schedule.updated_at)
    .execute(pool)
    .await?;
    get_schedule(pool, &schedule.id).await
}

pub async fn update_schedule(pool: &SqlitePool, id: &str, req: UpdateSchedule) -> AppResult<Schedule> {
    let mut schedule = get_schedule(pool, id).await?;
    let now = Utc::now().to_rfc3339();
    if let Some(name) = req.name {
        schedule.name = name;
    }
    if let Some(active) = req.active {
        schedule.active = active;
    }
    if let Some(rules) = req.rules {
        schedule.rules_json = rules.to_string();
    }
    schedule.updated_at = now;
    let active_i = if schedule.active { 1_i64 } else { 0_i64 };
    sqlx::query("UPDATE schedules SET name=?, active=?, rules_json=?, updated_at=? WHERE id=?")
        .bind(&schedule.name)
        .bind(active_i)
        .bind(&schedule.rules_json)
        .bind(&schedule.updated_at)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(schedule)
}

pub async fn delete_schedule(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let rows = sqlx::query("DELETE FROM schedules WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("Schedule {id} not found")));
    }
    Ok(())
}
