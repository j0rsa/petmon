use crate::domain::medication::{
    CreateMedication, MedType, Medication, PillFraction, PillShape, UpdateMedication,
};
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
    pill_shape: Option<String>,
    pill_fraction: Option<String>,
    color: String,
    created_at: String,
    updated_at: String,
}

fn parse_pill_shape(raw: Option<String>) -> AppResult<Option<PillShape>> {
    match raw {
        None => Ok(None),
        Some(value) => PillShape::parse(&value)
            .map(Some)
            .ok_or_else(|| AppError::Internal(format!("invalid pill_shape: {value}"))),
    }
}

fn parse_pill_fraction(raw: Option<String>) -> AppResult<Option<PillFraction>> {
    match raw {
        None => Ok(None),
        Some(value) => PillFraction::parse(&value)
            .map(Some)
            .ok_or_else(|| AppError::Internal(format!("invalid pill_fraction: {value}"))),
    }
}

fn row_to_medication(row: MedicationRow) -> AppResult<Medication> {
    let med_type = MedType::parse(&row.med_type)
        .ok_or_else(|| AppError::Internal(format!("invalid med_type: {}", row.med_type)))?;
    Ok(Medication {
        id: row.id,
        pet_id: row.pet_id,
        name: row.name,
        med_type,
        pill_shape: parse_pill_shape(row.pill_shape)?,
        pill_fraction: parse_pill_fraction(row.pill_fraction)?,
        color: row.color,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn validate_pill_fields(
    med_type: MedType,
    pill_shape: Option<PillShape>,
    pill_fraction: Option<PillFraction>,
) -> AppResult<()> {
    match med_type {
        MedType::Pill => {
            if pill_shape.is_none() || pill_fraction.is_none() {
                return Err(AppError::BadRequest(
                    "pill_shape and pill_fraction are required for pill medications".into(),
                ));
            }
        }
        MedType::Liquid => {
            if pill_shape.is_some() || pill_fraction.is_some() {
                return Err(AppError::BadRequest(
                    "pill_shape and pill_fraction must not be set for liquid medications".into(),
                ));
            }
        }
    }
    Ok(())
}

#[tracing::instrument(skip(pool))]
pub async fn list_by_pet(pool: &SqlitePool, pet_id: Uuid) -> AppResult<Vec<Medication>> {
    let rows = sqlx::query_as::<_, MedicationRow>(
        "SELECT id, pet_id, name, med_type, pill_shape, pill_fraction, color, created_at, updated_at
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
        "SELECT id, pet_id, name, med_type, pill_shape, pill_fraction, color, created_at, updated_at
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
    validate_pill_fields(req.med_type, req.pill_shape, req.pill_fraction)?;

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let color = req.color.unwrap_or_else(|| "#6366f1".to_string());

    sqlx::query(
        "INSERT INTO medications
         (id, pet_id, name, med_type, pill_shape, pill_fraction, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&req.name)
    .bind(req.med_type.as_str())
    .bind(req.pill_shape.map(|s| s.as_str().to_string()))
    .bind(req.pill_fraction.map(|f| f.as_str().to_string()))
    .bind(&color)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

#[tracing::instrument(skip(pool, req))]
pub async fn update(pool: &SqlitePool, id: &str, req: UpdateMedication) -> AppResult<Medication> {
    let existing = get(pool, id).await?;
    validate_pill_fields(
        existing.med_type,
        req.pill_shape.or(existing.pill_shape),
        req.pill_fraction.or(existing.pill_fraction),
    )?;

    let now = Utc::now().to_rfc3339();
    let name = req.name.unwrap_or(existing.name);
    let pill_shape = req.pill_shape.or(existing.pill_shape);
    let pill_fraction = req.pill_fraction.or(existing.pill_fraction);
    let color = req.color.unwrap_or(existing.color);

    sqlx::query(
        "UPDATE medications SET name = ?, pill_shape = ?, pill_fraction = ?, color = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&name)
    .bind(pill_shape.map(|s| s.as_str().to_string()))
    .bind(pill_fraction.map(|f| f.as_str().to_string()))
    .bind(&color)
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
