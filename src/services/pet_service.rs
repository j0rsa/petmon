use crate::domain::pet::{CreatePet, Pet, UpdatePet};
use crate::error::{AppError, AppResult};
use crate::repo::pets;
use crate::services::elimination_classifier;
use sqlx::SqlitePool;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Pet>> {
    pets::list_pets(pool).await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: Uuid) -> AppResult<Pet> {
    pets::get_pet(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(pool: &SqlitePool, req: CreatePet) -> AppResult<Pet> {
    if req.name.trim().is_empty() {
        return Err(AppError::Validation {
            field: "name".to_string(),
            message: "Name cannot be empty".to_string(),
        });
    }
    let pet = Pet::new(req);
    pets::create_pet(pool, pet).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(pool: &SqlitePool, id: Uuid, req: UpdatePet) -> AppResult<Pet> {
    if let Some(name) = &req.name {
        if name.trim().is_empty() {
            return Err(AppError::Validation {
                field: "name".to_string(),
                message: "Name cannot be empty".to_string(),
            });
        }
    }
    let enabled_auto_categorize = req.elimination_auto_categorize_by_duration;
    let pet = pets::update_pet(pool, id, req).await?;
    if enabled_auto_categorize == Some(true) {
        elimination_classifier::maybe_train_on_enable(pool, id).await?;
    }
    Ok(pet)
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: Uuid) -> AppResult<()> {
    pets::delete_pet(pool, id).await
}
