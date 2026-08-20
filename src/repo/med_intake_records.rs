use crate::domain::medication::{CreateMedIntakeRecord, MedIntakeRecord, MedIntakeRecordFilters};
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
    assignment_id: Option<String>,
    occurred_at: String,
    local_date: String,
    dosage: String,
    taken: i64,
    note: Option<String>,
    source_type: String,
    created_at: String,
}

fn row_to_record(row: MedIntakeRow) -> MedIntakeRecord {
    MedIntakeRecord {
        id: row.id,
        pet_id: row.pet_id,
        medication_id: row.medication_id,
        assignment_id: row.assignment_id,
        occurred_at: row.occurred_at,
        local_date: row.local_date,
        dosage: row.dosage,
        taken: row.taken != 0,
        note: row.note,
        source_type: row.source_type,
        created_at: row.created_at,
    }
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
        "SELECT id, pet_id, medication_id, assignment_id, occurred_at, local_date, dosage, taken, note, source_type, created_at
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
    Ok(rows.into_iter().map(row_to_record).collect())
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<MedIntakeRecord> {
    let row = sqlx::query_as::<_, MedIntakeRow>(
        "SELECT id, pet_id, medication_id, assignment_id, occurred_at, local_date, dosage, taken, note, source_type, created_at
         FROM med_intake_records WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Med intake record {id} not found")))?;
    Ok(row_to_record(row))
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

    let assignment = crate::repo::med_assignments::active_for_medication_on(
        pool,
        &req.medication_id,
        &local_date,
    )
    .await?;

    let dosage = match req.dosage {
        Some(d) if !d.trim().is_empty() => d,
        _ => assignment
            .as_ref()
            .map(|a| a.dosage.clone())
            .ok_or_else(|| {
                AppError::BadRequest(
                    "dosage is required when no active assignment exists for this medication".into(),
                )
            })?,
    };

    let taken = req.taken.unwrap_or(true);
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let source_type = req.source_type.unwrap_or_else(|| "manual".to_string());

    sqlx::query(
        "INSERT INTO med_intake_records
         (id, pet_id, medication_id, assignment_id, occurred_at, local_date, dosage, taken, note, source_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&req.medication_id)
    .bind(assignment.as_ref().map(|a| a.id.clone()))
    .bind(&occurred_at)
    .bind(&local_date)
    .bind(&dosage)
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
