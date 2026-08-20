use crate::domain::medication::{
    CreateMedIntakeRecord, DoseFraction, MedIntakeCore, MedIntakeRecord, MedIntakeRecordFilters,
    hydrate_intake,
};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct MedIntakeRow {
    id: String,
    pet_id: Uuid,
    medication_id: String,
    assignment_id: String,
    dose_fraction_override: Option<String>,
    liquid_dose_ml_override: Option<f64>,
    occurred_at: String,
    local_date: String,
    taken: i64,
    note: Option<String>,
    source_type: String,
    created_at: String,
}

fn parse_dose_fraction(raw: Option<String>) -> AppResult<Option<DoseFraction>> {
    match raw {
        None => Ok(None),
        Some(value) => DoseFraction::parse(&value)
            .map(Some)
            .ok_or_else(|| AppError::Internal(format!("invalid dose_fraction: {value}"))),
    }
}

fn row_to_core(row: MedIntakeRow) -> AppResult<MedIntakeCore> {
    Ok(MedIntakeCore {
        id: row.id,
        pet_id: row.pet_id,
        medication_id: row.medication_id,
        assignment_id: row.assignment_id,
        dose_fraction_override: parse_dose_fraction(row.dose_fraction_override)?,
        liquid_dose_ml_override: row.liquid_dose_ml_override,
        occurred_at: row.occurred_at,
        local_date: row.local_date,
        taken: row.taken != 0,
        note: row.note,
        source_type: row.source_type,
        created_at: row.created_at,
    })
}

async fn load_hydrated(pool: &SqlitePool, core: MedIntakeCore) -> AppResult<MedIntakeRecord> {
    let medication = crate::repo::medications::get(pool, &core.medication_id).await?;
    let assignment = crate::repo::med_assignments::get(pool, &core.assignment_id).await?;
    Ok(hydrate_intake(medication.med_type, core, assignment))
}

pub const DEFAULT_RECENT_LIMIT: i64 = 20;

#[tracing::instrument(skip(pool, filters))]
pub async fn list(
    pool: &SqlitePool,
    filters: &MedIntakeRecordFilters,
) -> AppResult<Vec<MedIntakeRecord>> {
    let has_date_range = filters.date_from.is_some() || filters.date_to.is_some();
    let limit = filters.limit.or(if has_date_range {
        None
    } else {
        Some(DEFAULT_RECENT_LIMIT)
    });
    let order_desc = !has_date_range;

    let mut query = String::from(
        "SELECT id, pet_id, medication_id, assignment_id, dose_fraction_override, liquid_dose_ml_override, occurred_at, local_date, taken, note, source_type, created_at
         FROM med_intake_records WHERE 1=1",
    );
    if filters.pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    if filters.medication_id.is_some() {
        query.push_str(" AND medication_id = ?");
    }
    if filters.date_from.is_some() {
        query.push_str(" AND local_date >= ?");
    }
    if filters.date_to.is_some() {
        query.push_str(" AND local_date <= ?");
    }
    query.push_str(if order_desc {
        " ORDER BY occurred_at DESC"
    } else {
        " ORDER BY occurred_at ASC"
    });
    if let Some(limit) = limit {
        query.push_str(&format!(" LIMIT {}", limit.max(0)));
    }
    if let Some(offset) = filters.offset {
        query.push_str(&format!(" OFFSET {}", offset.max(0)));
    }

    let mut q = sqlx::query_as::<_, MedIntakeRow>(sqlx::AssertSqlSafe(query));
    if let Some(pet_id_str) = &filters.pet_id {
        let pet_id = Uuid::parse_str(pet_id_str)
            .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {pet_id_str}")))?;
        q = q.bind(pet_id);
    }
    if let Some(medication_id) = &filters.medication_id {
        q = q.bind(medication_id);
    }
    if let Some(from) = &filters.date_from {
        q = q.bind(from);
    }
    if let Some(to) = &filters.date_to {
        q = q.bind(to);
    }

    let rows = q.fetch_all(pool).await?;
    let mut out = Vec::new();
    for row in rows {
        out.push(load_hydrated(pool, row_to_core(row)?).await?);
    }
    Ok(out)
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<MedIntakeRecord> {
    let row = sqlx::query_as::<_, MedIntakeRow>(
        "SELECT id, pet_id, medication_id, assignment_id, dose_fraction_override, liquid_dose_ml_override, occurred_at, local_date, taken, note, source_type, created_at
         FROM med_intake_records WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Med intake record {id} not found")))?;
    load_hydrated(pool, row_to_core(row)?).await
}

#[tracing::instrument(skip(pool, req))]
pub async fn create(
    pool: &SqlitePool,
    req: CreateMedIntakeRecord,
    timezone: Tz,
) -> AppResult<MedIntakeRecord> {
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    let medication = crate::repo::medications::get(pool, &req.medication_id).await?;
    if medication.pet_id != pet_id {
        return Err(AppError::BadRequest(
            "medication does not belong to the given pet".into(),
        ));
    }

    let occurred_at = req.occurred_at.unwrap_or_else(|| {
        Utc::now()
            .with_timezone(&timezone)
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    });
    let local_date = req
        .local_date
        .unwrap_or_else(|| occurred_at.split('T').next().unwrap_or("").to_string());

    let assignment = if let Some(id) = req.assignment_id {
        let assignment = crate::repo::med_assignments::get(pool, &id).await?;
        if assignment.medication_id != req.medication_id {
            return Err(AppError::BadRequest(
                "assignment does not belong to this medication".into(),
            ));
        }
        if !crate::domain::medication::assignment_active_on(&assignment, &local_date) {
            return Err(AppError::BadRequest(
                "assignment is not active on the given date".into(),
            ));
        }
        assignment
    } else {
        crate::repo::med_assignments::active_for_medication_on(
            pool,
            &req.medication_id,
            &local_date,
        )
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(
                "no active assignment for this medication on the given date".into(),
            )
        })?
    };

    if req.dose_fraction_override.is_some() && medication.med_type != crate::domain::medication::MedType::Pill {
        return Err(AppError::BadRequest(
            "dose_fraction_override applies to pill medications only".into(),
        ));
    }
    if req.liquid_dose_ml_override.is_some()
        && medication.med_type != crate::domain::medication::MedType::Liquid
    {
        return Err(AppError::BadRequest(
            "liquid_dose_ml_override applies to liquid medications only".into(),
        ));
    }

    let taken = req.taken.unwrap_or(true);
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let source_type = req.source_type.unwrap_or_else(|| "manual".to_string());

    sqlx::query(
        "INSERT INTO med_intake_records
         (id, pet_id, medication_id, assignment_id, dose_fraction_override, liquid_dose_ml_override, occurred_at, local_date, taken, note, source_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&req.medication_id)
    .bind(&assignment.id)
    .bind(req.dose_fraction_override.map(|f| f.as_str().to_string()))
    .bind(req.liquid_dose_ml_override)
    .bind(&occurred_at)
    .bind(&local_date)
    .bind(if taken { 1 } else { 0 })
    .bind(&req.note)
    .bind(&source_type)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM med_intake_records WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Med intake record {id} not found")));
    }
    Ok(())
}
