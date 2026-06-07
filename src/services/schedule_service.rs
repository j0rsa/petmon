use crate::domain::schedule::{CreateSchedule, Schedule, UpdateSchedule};
use crate::error::{AppError, AppResult};
use crate::repo::{cats, schedules};
use sqlx::SqlitePool;

pub async fn list(pool: &SqlitePool, cat_id: Option<&str>) -> AppResult<Vec<Schedule>> {
    schedules::list_schedules(pool, cat_id).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Schedule> {
    schedules::get_schedule(pool, id).await
}

pub async fn create(pool: &SqlitePool, req: CreateSchedule) -> AppResult<Schedule> {
    if req.name.trim().is_empty() {
        return Err(AppError::Validation {
            field: "name".to_string(),
            message: "Name cannot be empty".to_string(),
        });
    }
    cats::get_cat(pool, &req.cat_id).await?;
    let schedule = Schedule::new(req);
    schedules::create_schedule(pool, schedule).await
}

pub async fn update(pool: &SqlitePool, id: &str, req: UpdateSchedule) -> AppResult<Schedule> {
    schedules::update_schedule(pool, id, req).await
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    schedules::delete_schedule(pool, id).await
}
