use crate::domain::medication::{
    day_before, CreateMedAssignment, CreateMedFormulation, DoseFraction,
    MedAssignment, MedAssignmentCore, MedAssignmentFilters, MedFrequency, MedType,
    ReviseMedAssignment, hydrate_assignment,
};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct MedAssignmentRow {
    id: String,
    medication_id: String,
    pet_id: Uuid,
    formulation_id: String,
    dose_fraction: Option<String>,
    liquid_dose_ml: Option<f64>,
    frequency_json: String,
    date_from: String,
    date_to: Option<String>,
    optional: i64,
    created_at: String,
    updated_at: String,
}

fn parse_dose_fraction(raw: Option<String>) -> AppResult<Option<DoseFraction>> {
    match raw {
        None => Ok(None),
        Some(value) => DoseFraction::parse(&value)
            .map(Some)
            .ok_or_else(|| AppError::Internal(format!("invalid dose_fraction: {value}"))),
    }
}

fn row_to_core(row: MedAssignmentRow) -> AppResult<MedAssignmentCore> {
    Ok(MedAssignmentCore {
        id: row.id,
        medication_id: row.medication_id,
        pet_id: row.pet_id,
        formulation_id: row.formulation_id,
        dose_fraction: parse_dose_fraction(row.dose_fraction)?,
        liquid_dose_ml: row.liquid_dose_ml,
        frequency: MedFrequency::from_json(&row.frequency_json),
        date_from: row.date_from,
        date_to: row.date_to,
        optional: row.optional != 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn core_active_on(core: &MedAssignmentCore, date: &str) -> bool {
    if core.date_from.as_str() > date {
        return false;
    }
    match &core.date_to {
        None => true,
        Some(to) => to.as_str() >= date,
    }
}

async fn load_hydrated(pool: &SqlitePool, core: MedAssignmentCore) -> AppResult<MedAssignment> {
    let medication = crate::repo::medications::get(pool, &core.medication_id).await?;
    let formulation = crate::repo::med_formulations::get(pool, &core.formulation_id).await?;
    Ok(hydrate_assignment(medication.med_type, core, formulation))
}

fn validate_dose(
    med_type: MedType,
    dose_fraction: Option<DoseFraction>,
    liquid_dose_ml: Option<f64>,
) -> AppResult<()> {
    match med_type {
        MedType::Pill => {
            if dose_fraction.is_none() {
                return Err(AppError::BadRequest(
                    "dose_fraction is required for pill assignments".into(),
                ));
            }
            if liquid_dose_ml.is_some() {
                return Err(AppError::BadRequest(
                    "liquid_dose_ml must not be set for pill assignments".into(),
                ));
            }
        }
        MedType::Liquid => {
            if liquid_dose_ml.is_none() {
                return Err(AppError::BadRequest(
                    "liquid_dose_ml is required for liquid assignments".into(),
                ));
            }
            if dose_fraction.is_some() {
                return Err(AppError::BadRequest(
                    "dose_fraction must not be set for liquid assignments".into(),
                ));
            }
        }
    }
    Ok(())
}

async fn resolve_formulation_id(
    pool: &SqlitePool,
    medication_id: &str,
    med_type: MedType,
    formulation_id: Option<String>,
    tablet_strength_mg: Option<f64>,
    pill_shape: Option<crate::domain::medication::PillShape>,
    liquid_concentration_mg_per_ml: Option<f64>,
) -> AppResult<String> {
    if let Some(id) = formulation_id {
        let formulation = crate::repo::med_formulations::get(pool, &id).await?;
        if formulation.medication_id != medication_id {
            return Err(AppError::BadRequest(
                "formulation does not belong to this medication".into(),
            ));
        }
        return Ok(id);
    }
    if tablet_strength_mg.is_none()
        && pill_shape.is_none()
        && liquid_concentration_mg_per_ml.is_none()
    {
        return Err(AppError::BadRequest(
            "formulation_id or new formulation fields are required".into(),
        ));
    }
    let created = crate::repo::med_formulations::create(
        pool,
        medication_id,
        med_type,
        CreateMedFormulation {
            tablet_strength_mg,
            pill_shape,
            liquid_concentration_mg_per_ml,
        },
    )
    .await?;
    Ok(created.id)
}

#[tracing::instrument(skip(pool, filters))]
pub async fn list(
    pool: &SqlitePool,
    filters: &MedAssignmentFilters,
) -> AppResult<Vec<MedAssignment>> {
    let mut query = String::from(
        "SELECT id, medication_id, pet_id, formulation_id, dose_fraction, liquid_dose_ml, frequency_json, date_from, date_to, optional, created_at, updated_at
         FROM med_assignments WHERE 1=1",
    );
    if filters.pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    if filters.medication_id.is_some() {
        query.push_str(" AND medication_id = ?");
    }
    query.push_str(" ORDER BY medication_id ASC, date_from DESC");

    let mut q = sqlx::query_as::<_, MedAssignmentRow>(sqlx::AssertSqlSafe(query));
    if let Some(pet_id_str) = &filters.pet_id {
        let pet_id = Uuid::parse_str(pet_id_str)
            .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {pet_id_str}")))?;
        q = q.bind(pet_id);
    }
    if let Some(medication_id) = &filters.medication_id {
        q = q.bind(medication_id);
    }

    let rows = q.fetch_all(pool).await?;
    let mut out = Vec::new();
    for row in rows {
        out.push(load_hydrated(pool, row_to_core(row)?).await?);
    }
    Ok(out)
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<MedAssignment> {
    let row = sqlx::query_as::<_, MedAssignmentRow>(
        "SELECT id, medication_id, pet_id, formulation_id, dose_fraction, liquid_dose_ml, frequency_json, date_from, date_to, optional, created_at, updated_at
         FROM med_assignments WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Med assignment {id} not found")))?;
    load_hydrated(pool, row_to_core(row)?).await
}

#[tracing::instrument(skip(pool))]
pub async fn active_for_medication_on(
    pool: &SqlitePool,
    medication_id: &str,
    date: &str,
) -> AppResult<Option<MedAssignment>> {
    let rows = sqlx::query_as::<_, MedAssignmentRow>(
        "SELECT id, medication_id, pet_id, formulation_id, dose_fraction, liquid_dose_ml, frequency_json, date_from, date_to, optional, created_at, updated_at
         FROM med_assignments
         WHERE medication_id = ? AND date_from <= ?
         ORDER BY date_from DESC",
    )
    .bind(medication_id)
    .bind(date)
    .fetch_all(pool)
    .await?;

    for row in rows {
        let core = row_to_core(row)?;
        if core_active_on(&core, date) {
            return Ok(Some(load_hydrated(pool, core).await?));
        }
    }
    Ok(None)
}

#[tracing::instrument(skip(pool, req))]
pub async fn create(pool: &SqlitePool, req: CreateMedAssignment) -> AppResult<MedAssignment> {
    let medication = crate::repo::medications::get(pool, &req.medication_id).await?;
    validate_dose(
        medication.med_type,
        req.dose_fraction,
        req.liquid_dose_ml,
    )?;

    let formulation_id = resolve_formulation_id(
        pool,
        &req.medication_id,
        medication.med_type,
        req.formulation_id,
        req.tablet_strength_mg,
        req.pill_shape,
        req.liquid_concentration_mg_per_ml,
    )
    .await?;

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let frequency = req.frequency.unwrap_or(MedFrequency { times: vec![] });
    let optional = req.optional.unwrap_or(false);

    sqlx::query(
        "INSERT INTO med_assignments
         (id, medication_id, pet_id, formulation_id, dose_fraction, liquid_dose_ml, frequency_json, date_from, date_to, optional, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&req.medication_id)
    .bind(medication.pet_id)
    .bind(&formulation_id)
    .bind(req.dose_fraction.map(|f| f.as_str().to_string()))
    .bind(req.liquid_dose_ml)
    .bind(frequency.to_json())
    .bind(&req.date_from)
    .bind(&req.date_to)
    .bind(if optional { 1 } else { 0 })
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

#[tracing::instrument(skip(pool, req))]
pub async fn revise(
    pool: &SqlitePool,
    assignment_id: &str,
    req: ReviseMedAssignment,
) -> AppResult<MedAssignment> {
    let existing = get(pool, assignment_id).await?;
    if req.effective_from.as_str() <= existing.date_from.as_str() {
        return Err(AppError::BadRequest(
            "effective_from must be after the current assignment start date".into(),
        ));
    }

    let medication = crate::repo::medications::get(pool, &existing.medication_id).await?;
    let dose_fraction = req.dose_fraction.or(existing.dose_fraction);
    let liquid_dose_ml = req.liquid_dose_ml.or(existing.liquid_dose_ml);
    validate_dose(medication.med_type, dose_fraction, liquid_dose_ml)?;

    let has_new_formulation = req.tablet_strength_mg.is_some()
        || req.pill_shape.is_some()
        || req.liquid_concentration_mg_per_ml.is_some();

    let formulation_id = if req.formulation_id.is_some() || has_new_formulation {
        resolve_formulation_id(
            pool,
            &existing.medication_id,
            medication.med_type,
            req.formulation_id,
            req.tablet_strength_mg,
            req.pill_shape,
            req.liquid_concentration_mg_per_ml,
        )
        .await?
    } else {
        existing.formulation_id.clone()
    };

    let end_date = day_before(&req.effective_from)
        .ok_or_else(|| AppError::BadRequest("invalid effective_from date".into()))?;
    let now = Utc::now().to_rfc3339();

    sqlx::query("UPDATE med_assignments SET date_to = ?, updated_at = ? WHERE id = ?")
        .bind(&end_date)
        .bind(&now)
        .bind(assignment_id)
        .execute(pool)
        .await?;

    create(
        pool,
        CreateMedAssignment {
            medication_id: existing.medication_id,
            formulation_id: Some(formulation_id),
            tablet_strength_mg: None,
            pill_shape: None,
            liquid_concentration_mg_per_ml: None,
            dose_fraction,
            liquid_dose_ml,
            frequency: req.frequency.or(Some(existing.frequency)),
            date_from: req.effective_from,
            date_to: req.date_to,
            optional: req.optional.or(Some(existing.optional)),
        },
    )
    .await
}
