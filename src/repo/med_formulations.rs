use crate::domain::medication::{CreateMedFormulation, MedFormulation, MedType, PillShape};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct FormulationRow {
    id: String,
    medication_id: String,
    tablet_strength_mg: Option<f64>,
    pill_shape: Option<String>,
    liquid_concentration_mg_per_ml: Option<f64>,
    created_at: String,
}

fn row_to_formulation(row: FormulationRow) -> AppResult<MedFormulation> {
    let pill_shape = match row.pill_shape {
        None => None,
        Some(value) => Some(
            PillShape::parse(&value)
                .ok_or_else(|| AppError::Internal(format!("invalid pill_shape: {value}")))?,
        ),
    };
    Ok(MedFormulation {
        id: row.id,
        medication_id: row.medication_id,
        tablet_strength_mg: row.tablet_strength_mg,
        pill_shape,
        liquid_concentration_mg_per_ml: row.liquid_concentration_mg_per_ml,
        created_at: row.created_at,
    })
}

pub fn validate_formulation(med_type: MedType, req: &CreateMedFormulation) -> AppResult<()> {
    match med_type {
        MedType::Pill => {
            if req.tablet_strength_mg.is_none() || req.pill_shape.is_none() {
                return Err(AppError::BadRequest(
                    "tablet_strength_mg and pill_shape are required for pill formulations".into(),
                ));
            }
            if req.liquid_concentration_mg_per_ml.is_some() {
                return Err(AppError::BadRequest(
                    "liquid_concentration_mg_per_ml must not be set for pill formulations".into(),
                ));
            }
        }
        MedType::Liquid => {
            if req.tablet_strength_mg.is_some() || req.pill_shape.is_some() {
                return Err(AppError::BadRequest(
                    "tablet_strength_mg and pill_shape must not be set for liquid formulations"
                        .into(),
                ));
            }
        }
    }
    Ok(())
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<MedFormulation> {
    let row = sqlx::query_as::<_, FormulationRow>(
        "SELECT id, medication_id, tablet_strength_mg, pill_shape, liquid_concentration_mg_per_ml, created_at
         FROM med_formulations WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Med formulation {id} not found")))?;
    row_to_formulation(row)
}

#[tracing::instrument(skip(pool))]
pub async fn list_for_medication(
    pool: &SqlitePool,
    medication_id: &str,
) -> AppResult<Vec<MedFormulation>> {
    let rows = sqlx::query_as::<_, FormulationRow>(
        "SELECT id, medication_id, tablet_strength_mg, pill_shape, liquid_concentration_mg_per_ml, created_at
         FROM med_formulations WHERE medication_id = ? ORDER BY created_at DESC",
    )
    .bind(medication_id)
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(row_to_formulation).collect()
}

#[tracing::instrument(skip(pool))]
pub async fn create(
    pool: &SqlitePool,
    medication_id: &str,
    med_type: MedType,
    req: CreateMedFormulation,
) -> AppResult<MedFormulation> {
    validate_formulation(med_type, &req)?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO med_formulations
         (id, medication_id, tablet_strength_mg, pill_shape, liquid_concentration_mg_per_ml, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(medication_id)
    .bind(req.tablet_strength_mg)
    .bind(req.pill_shape.map(|s| s.as_str().to_string()))
    .bind(req.liquid_concentration_mg_per_ml)
    .bind(&now)
    .execute(pool)
    .await?;
    get(pool, &id).await
}
