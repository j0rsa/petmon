use crate::domain::nutrition_schedule::{
    CreateNutritionSchedule, NutritionSchedule, UpdateNutritionSchedule,
};
use crate::error::{AppError, AppResult};
use crate::repo::{nutrition_schedules, pets};
use sqlx::SqlitePool;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list(pool: &SqlitePool, pet_id: Option<Uuid>) -> AppResult<Vec<NutritionSchedule>> {
    nutrition_schedules::list_schedules(pool, pet_id).await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<NutritionSchedule> {
    nutrition_schedules::get_schedule(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &SqlitePool,
    req: CreateNutritionSchedule,
) -> AppResult<NutritionSchedule> {
    if req.name.trim().is_empty() {
        return Err(AppError::Validation {
            field: "name".to_string(),
            message: "Name is required".to_string(),
        });
    }
    pets::get_pet(pool, req.pet_id).await?;
    let schedule = NutritionSchedule::new(req);
    nutrition_schedules::create_schedule(pool, schedule).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    req: UpdateNutritionSchedule,
) -> AppResult<NutritionSchedule> {
    nutrition_schedules::update_schedule(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    nutrition_schedules::delete_schedule(pool, id).await
}
