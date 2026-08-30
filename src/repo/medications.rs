use crate::domain::medication::{CreateMedication, MedType, Medication, UpdateMedication};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct MedicationRow {
    id: String,
    pet_id: Uuid,
    name: String,
    med_type: String,
    color: String,
    emoji: Option<String>,
    description: Option<String>,
    created_at: String,
    updated_at: String,
}

fn row_to_medication(row: MedicationRow) -> AppResult<Medication> {
    let med_type = MedType::parse(&row.med_type)
        .ok_or_else(|| AppError::Internal(format!("invalid med_type: {}", row.med_type)))?;
    Ok(Medication {
        id: row.id,
        pet_id: row.pet_id,
        name: row.name,
        med_type,
        color: row.color,
        emoji: row.emoji,
        description: row.description,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

#[tracing::instrument(skip(pool))]
pub async fn list_by_pet(pool: &SqlitePool, pet_id: Uuid) -> AppResult<Vec<Medication>> {
    let rows = sqlx::query_as::<_, MedicationRow>(
        "SELECT id, pet_id, name, med_type, color, emoji, description, created_at, updated_at
         FROM medications WHERE pet_id = ? ORDER BY name ASC",
    )
    .bind(pet_id)
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(row_to_medication).collect()
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Medication> {
    let row = sqlx::query_as::<_, MedicationRow>(
        "SELECT id, pet_id, name, med_type, color, emoji, description, created_at, updated_at
         FROM medications WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Medication {id} not found")))?;
    row_to_medication(row)
}

#[tracing::instrument(skip(pool, req))]
pub async fn create(pool: &SqlitePool, req: CreateMedication) -> AppResult<Medication> {
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let color = req.color.unwrap_or_else(|| "#6366f1".to_string());
    let emoji = req.emoji.filter(|emoji| !emoji.trim().is_empty());

    let description = req.description.filter(|d| !d.trim().is_empty());

    sqlx::query(
        "INSERT INTO medications (id, pet_id, name, med_type, color, emoji, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&req.name)
    .bind(req.med_type.as_str())
    .bind(&color)
    .bind(&emoji)
    .bind(&description)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

#[tracing::instrument(skip(pool, req))]
pub async fn update(pool: &SqlitePool, id: &str, req: UpdateMedication) -> AppResult<Medication> {
    let existing = get(pool, id).await?;
    let now = Utc::now().to_rfc3339();
    let name = req.name.unwrap_or(existing.name);
    let color = req.color.unwrap_or(existing.color);
    let emoji = match req.emoji {
        Some(emoji) if emoji.trim().is_empty() => None,
        Some(emoji) => Some(emoji),
        None => existing.emoji,
    };
    let description = match req.description {
        Some(d) if d.trim().is_empty() => None,
        Some(d) => Some(d),
        None => existing.description,
    };

    sqlx::query(
        "UPDATE medications SET name = ?, color = ?, emoji = ?, description = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&name)
    .bind(&color)
    .bind(&emoji)
    .bind(&description)
    .bind(&now)
    .bind(id)
    .execute(pool)
    .await?;

    get(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM medications WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Medication {id} not found")));
    }
    Ok(())
}
