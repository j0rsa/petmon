use crate::domain::pet::{Pet, UpdatePet};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

const PET_COLUMNS: &str =
    "id, name, species, status, breed, birth_date, blood_type, color, weight_kg, feeding_notes, telegram_chat_id, telegram_thread_id, created_at, updated_at";

pub async fn list_pets(pool: &SqlitePool) -> AppResult<Vec<Pet>> {
    let query = format!("SELECT {PET_COLUMNS} FROM pets ORDER BY name");
    Ok(sqlx::query_as::<_, Pet>(sqlx::AssertSqlSafe(query))
        .fetch_all(pool)
        .await?)
}

pub async fn get_pet(pool: &SqlitePool, id: Uuid) -> AppResult<Pet> {
    let query = format!("SELECT {PET_COLUMNS} FROM pets WHERE id = ?");
    sqlx::query_as::<_, Pet>(sqlx::AssertSqlSafe(query))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Pet {id} not found")))
}

pub async fn create_pet(pool: &SqlitePool, pet: Pet) -> AppResult<Pet> {
    sqlx::query(
        "INSERT INTO pets (id, name, species, status, breed, birth_date, blood_type, color, weight_kg, feeding_notes, telegram_chat_id, telegram_thread_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(pet.id)
    .bind(&pet.name)
    .bind(pet.species)
    .bind(pet.status)
    .bind(&pet.breed)
    .bind(&pet.birth_date)
    .bind(&pet.blood_type)
    .bind(&pet.color)
    .bind(pet.weight_kg)
    .bind(&pet.feeding_notes)
    .bind(&pet.telegram_chat_id)
    .bind(&pet.telegram_thread_id)
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
    if req.breed.is_some() {
        pet.breed = req.breed;
    }
    if req.birth_date.is_some() {
        pet.birth_date = req.birth_date;
    }
    if req.blood_type.is_some() {
        pet.blood_type = req.blood_type;
    }
    if req.color.is_some() {
        pet.color = req.color;
    }
    if req.weight_kg.is_some() {
        pet.weight_kg = req.weight_kg;
    }
    if req.feeding_notes.is_some() {
        pet.feeding_notes = req.feeding_notes;
    }
    if req.telegram_chat_id.is_some() {
        pet.telegram_chat_id = req.telegram_chat_id;
    }
    if req.telegram_thread_id.is_some() {
        pet.telegram_thread_id = req.telegram_thread_id;
    }
    pet.updated_at = now;
    sqlx::query(
        "UPDATE pets SET name=?, species=?, status=?, breed=?, birth_date=?, blood_type=?, color=?, weight_kg=?, feeding_notes=?, telegram_chat_id=?, telegram_thread_id=?, updated_at=? WHERE id=?",
    )
    .bind(&pet.name)
    .bind(pet.species)
    .bind(pet.status)
    .bind(&pet.breed)
    .bind(&pet.birth_date)
    .bind(&pet.blood_type)
    .bind(&pet.color)
    .bind(pet.weight_kg)
    .bind(&pet.feeding_notes)
    .bind(&pet.telegram_chat_id)
    .bind(&pet.telegram_thread_id)
    .bind(&pet.updated_at)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(pet)
}

pub async fn update_weight(pool: &SqlitePool, pet_id: &str, weight_kg: f64) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE pets SET weight_kg=?, updated_at=? WHERE id=?")
        .bind(weight_kg)
        .bind(&now)
        .bind(pet_id)
        .execute(pool)
        .await?;
    Ok(())
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
