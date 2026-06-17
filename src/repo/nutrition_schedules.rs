use crate::domain::nutrition_schedule::{NutritionSchedule, UpdateNutritionSchedule};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn list_schedules(
    pool: &SqlitePool,
    pet_id: Option<Uuid>,
) -> AppResult<Vec<NutritionSchedule>> {
    let mut query = String::from(
        "SELECT id, pet_id, name, active, rules_json, created_at, updated_at FROM nutrition_schedules",
    );
    if pet_id.is_some() {
        query.push_str(" WHERE pet_id = ?");
    }
    query.push_str(" ORDER BY created_at DESC");

    let mut q = sqlx::query_as::<_, NutritionSchedule>(sqlx::AssertSqlSafe(query));
    if let Some(pet_id) = pet_id {
        q = q.bind(pet_id);
    }
    Ok(q.fetch_all(pool).await?)
}

pub async fn get_schedule(pool: &SqlitePool, id: &str) -> AppResult<NutritionSchedule> {
    sqlx::query_as::<_, NutritionSchedule>(
        "SELECT id, pet_id, name, active, rules_json, created_at, updated_at FROM nutrition_schedules WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Nutrition schedule {id} not found")))
}

pub async fn create_schedule(
    pool: &SqlitePool,
    schedule: NutritionSchedule,
) -> AppResult<NutritionSchedule> {
    let active_i = if schedule.active { 1_i64 } else { 0_i64 };
    sqlx::query(
        "INSERT INTO nutrition_schedules (id, pet_id, name, active, rules_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&schedule.id)
    .bind(schedule.pet_id)
    .bind(&schedule.name)
    .bind(active_i)
    .bind(&schedule.rules_json)
    .bind(&schedule.created_at)
    .bind(&schedule.updated_at)
    .execute(pool)
    .await?;
    get_schedule(pool, &schedule.id).await
}

pub async fn update_schedule(
    pool: &SqlitePool,
    id: &str,
    req: UpdateNutritionSchedule,
) -> AppResult<NutritionSchedule> {
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
    sqlx::query(
        "UPDATE nutrition_schedules SET name=?, active=?, rules_json=?, updated_at=? WHERE id=?",
    )
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
    let rows = sqlx::query("DELETE FROM nutrition_schedules WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!(
            "Nutrition schedule {id} not found"
        )));
    }
    Ok(())
}
