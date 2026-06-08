use crate::domain::pet::{Pet, UpdatePet};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn list_pets(pool: &SqlitePool) -> AppResult<Vec<Pet>> {
    let pets = sqlx::query_as::<_, Pet>(
        "SELECT id, name, species, status, weight_kg, feeding_notes, created_at, updated_at FROM pets ORDER BY name",
    )
    .fetch_all(pool)
    .await?;
    Ok(pets)
}

pub async fn get_pet(pool: &SqlitePool, id: Uuid) -> AppResult<Pet> {
    let pet = sqlx::query_as::<_, Pet>(
        "SELECT id, name, species, status, weight_kg, feeding_notes, created_at, updated_at FROM pets WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Pet {id} not found")))?;
    Ok(pet)
}

pub async fn create_pet(pool: &SqlitePool, pet: Pet) -> AppResult<Pet> {
    sqlx::query(
        "INSERT INTO pets (id, name, species, status, weight_kg, feeding_notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(pet.id)
    .bind(&pet.name)
    .bind(pet.species)
    .bind(pet.status)
    .bind(pet.weight_kg)
    .bind(&pet.feeding_notes)
    .bind(&pet.created_at)
    .bind(&pet.updated_at)
    .execute(pool)
    .await?;
    get_pet(pool, pet.id).await
}

pub async fn update_pet(pool: &SqlitePool, id: Uuid, req: UpdatePet) -> AppResult<Pet> {
    let mut pet = get_pet(pool, id).await?;
    let now = Utc::now().to_rfc3339();
    if let Some(name) = req.name {
        pet.name = name;
    }
    if let Some(species) = req.species {
        pet.species = species;
    }
    if let Some(status) = req.status {
        pet.status = status;
    }
    if req.weight_kg.is_some() {
        pet.weight_kg = req.weight_kg;
    }
    if req.feeding_notes.is_some() {
        pet.feeding_notes = req.feeding_notes;
    }
    pet.updated_at = now;
    sqlx::query("UPDATE pets SET name=?, species=?, status=?, weight_kg=?, feeding_notes=?, updated_at=? WHERE id=?")
        .bind(&pet.name)
        .bind(pet.species)
        .bind(pet.status)
        .bind(pet.weight_kg)
        .bind(&pet.feeding_notes)
        .bind(&pet.updated_at)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(pet)
}

pub async fn delete_pet(pool: &SqlitePool, id: Uuid) -> AppResult<()> {
    let rows = sqlx::query("DELETE FROM pets WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("Pet {id} not found")));
    }
    Ok(())
}
