use crate::domain::nutrition_schedule::{
    CreateNutritionSchedule, NutritionSchedule, UpdateNutritionSchedule,
};
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::{AppError, AppResult};
use crate::repo::{nutrition_schedules, pets};
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &ServiceContext,
    pet_id: Option<Uuid>,
) -> AppResult<Vec<NutritionSchedule>> {
    nutrition_schedules::list_schedules_scoped(pool, pet_id, &pool.visibility(pet_id).await?).await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &ServiceContext, id: &str) -> AppResult<NutritionSchedule> {
    let owner = nutrition_schedules::get_schedule(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::View).await?;

    nutrition_schedules::get_schedule(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &ServiceContext,
    req: CreateNutritionSchedule,
) -> AppResult<NutritionSchedule> {
    pool.check(Some(req.pet_id), ResourceAction::WriteProfile)
        .await?;

    if req.name.trim().is_empty() {
        return Err(AppError::Validation {
            field: "name".to_string(),
            message: "Name is required".to_string(),
        });
    }
    pets::get_pet(pool, req.pet_id).await?;
    let schedule = NutritionSchedule::new(req)?;
    nutrition_schedules::create_schedule(pool, schedule).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(
    pool: &ServiceContext,
    id: &str,
    req: UpdateNutritionSchedule,
) -> AppResult<NutritionSchedule> {
    let owner = nutrition_schedules::get_schedule(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteProfile)
        .await?;

    nutrition_schedules::update_schedule(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &ServiceContext, id: &str) -> AppResult<()> {
    let owner = nutrition_schedules::get_schedule(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteProfile)
        .await?;

    nutrition_schedules::delete_schedule(pool, id).await
}
