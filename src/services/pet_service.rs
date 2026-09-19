use crate::domain::pet::{CreatePet, Pet, UpdatePet};
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::{AppError, AppResult};
use crate::repo::pets;
use crate::services::elimination_classifier;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list(pool: &ServiceContext) -> AppResult<Vec<Pet>> {
    pets::list_pets_scoped(pool, &pool.visibility(None).await?).await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &ServiceContext, id: Uuid) -> AppResult<Pet> {
    pool.check(Some(id), ResourceAction::View).await?;
    pets::get_pet(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(pool: &ServiceContext, req: CreatePet) -> AppResult<Pet> {
    let mut tx = pool.pool.begin().await?;
    let pet = create_in_transaction(pool, &mut tx, req).await?;
    tx.commit().await?;
    Ok(pet)
}

/// Extension writes must use this connection and commit together with this pet.
pub async fn create_in_transaction(
    pool: &ServiceContext,
    connection: &mut sqlx::SqliteConnection,
    req: CreatePet,
) -> AppResult<Pet> {
    pool.require_action_scope(ResourceAction::Create)?;
    pool.policy
        .authorize_transaction(connection, &pool.actor, None, ResourceAction::Create)
        .await?;
    if req.telegram_nutrition_chat_id.is_some()
        || req.telegram_meds_chat_id.is_some()
        || req.telegram_nutrition_thread_id.is_some()
        || req.telegram_meds_thread_id.is_some()
    {
        pool.policy
            .authorize_transaction(
                connection,
                &pool.actor,
                None,
                ResourceAction::ManageIntegrations,
            )
            .await?;
    }
    if req.name.trim().is_empty() {
        return Err(AppError::Validation {
            field: "name".to_string(),
            message: "Name cannot be empty".to_string(),
        });
    }
    let pet = Pet::new(req);
    pets::create_pet_on_connection(connection, pet).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(pool: &ServiceContext, id: Uuid, req: UpdatePet) -> AppResult<Pet> {
    pool.check(Some(id), ResourceAction::View).await?;
    let profile = req.name.is_some()
        || req.species.is_some()
        || req.breed.is_some()
        || req.birth_date.is_some()
        || req.blood_type.is_some()
        || req.color.is_some()
        || req.feeding_notes.is_some()
        || req.elimination_auto_categorize_by_duration.is_some();
    let integrations = req.telegram_nutrition_chat_id.is_some()
        || req.telegram_meds_chat_id.is_some()
        || req.telegram_nutrition_thread_id.is_some()
        || req.telegram_meds_thread_id.is_some();
    if !profile && !integrations && req.status.is_none() {
        return pets::get_pet(pool, id).await;
    }
    if profile {
        pool.check(Some(id), ResourceAction::WriteProfile).await?;
    }
    if req.status.is_some() {
        pool.check(Some(id), ResourceAction::ChangeStatus).await?;
    }
    if integrations {
        pool.check(Some(id), ResourceAction::ManageIntegrations)
            .await?;
    }
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
pub async fn delete(pool: &ServiceContext, id: Uuid) -> AppResult<()> {
    let mut tx = pool.pool.begin().await?;
    delete_in_transaction(pool, &mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn delete_in_transaction(
    pool: &ServiceContext,
    connection: &mut sqlx::SqliteConnection,
    id: Uuid,
) -> AppResult<()> {
    pool.require_action_scope(ResourceAction::Delete)?;
    pool.policy
        .authorize_transaction(connection, &pool.actor, Some(id), ResourceAction::Delete)
        .await?;
    pets::delete_pet_on_connection(connection, id).await
}

pub async fn get_nudge_settings(
    context: &ServiceContext,
    pet_id: Uuid,
) -> AppResult<crate::domain::pet_settings::PetNudgeSchedule> {
    context.check(Some(pet_id), ResourceAction::View).await?;
    pets::get_pet(context, pet_id).await?;
    crate::repo::pet_settings::get(
        context,
        &pet_id.to_string(),
        crate::domain::pet_settings::MED_NUDGE_KEY,
    )
    .await
}

pub async fn update_nudge_settings(
    context: &ServiceContext,
    pet_id: Uuid,
    schedule: &crate::domain::pet_settings::PetNudgeSchedule,
) -> AppResult<()> {
    context
        .check(Some(pet_id), ResourceAction::WriteProfile)
        .await?;
    pets::get_pet(context, pet_id).await?;
    crate::repo::pet_settings::upsert(
        context,
        &pet_id.to_string(),
        crate::domain::pet_settings::MED_NUDGE_KEY,
        schedule,
    )
    .await
}
