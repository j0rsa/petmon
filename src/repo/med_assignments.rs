use crate::domain::medication::{
    assignment_active_on, day_before, CreateMedAssignment, MedAssignment, MedAssignmentFilters,
    MedFrequency, ReviseMedAssignment,
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
    dosage: String,
    frequency_json: String,
    date_from: String,
    date_to: Option<String>,
    optional: i64,
    created_at: String,
    updated_at: String,
}

fn row_to_assignment(row: MedAssignmentRow) -> MedAssignment {
    MedAssignment {
        id: row.id,
        medication_id: row.medication_id,
        pet_id: row.pet_id,
        dosage: row.dosage,
        frequency: MedFrequency::from_json(&row.frequency_json),
        date_from: row.date_from,
        date_to: row.date_to,
        optional: row.optional != 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

#[tracing::instrument(skip(pool, filters))]
pub async fn list(
    pool: &SqlitePool,
    filters: &MedAssignmentFilters,
) -> AppResult<Vec<MedAssignment>> {
    let mut query = String::from(
        "SELECT id, medication_id, pet_id, dosage, frequency_json, date_from, date_to, optional, created_at, updated_at
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
    Ok(rows.into_iter().map(row_to_assignment).collect())
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<MedAssignment> {
    let row = sqlx::query_as::<_, MedAssignmentRow>(
        "SELECT id, medication_id, pet_id, dosage, frequency_json, date_from, date_to, optional, created_at, updated_at
         FROM med_assignments WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Med assignment {id} not found")))?;
    Ok(row_to_assignment(row))
}

#[tracing::instrument(skip(pool))]
pub async fn active_for_medication_on(
    pool: &SqlitePool,
    medication_id: &str,
    date: &str,
) -> AppResult<Option<MedAssignment>> {
    let rows = sqlx::query_as::<_, MedAssignmentRow>(
        "SELECT id, medication_id, pet_id, dosage, frequency_json, date_from, date_to, optional, created_at, updated_at
         FROM med_assignments
         WHERE medication_id = ? AND date_from <= ?
         ORDER BY date_from DESC",
    )
    .bind(medication_id)
    .bind(date)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(row_to_assignment)
        .find(|a| assignment_active_on(a, date)))
}

#[tracing::instrument(skip(pool, req))]
pub async fn create(pool: &SqlitePool, req: CreateMedAssignment) -> AppResult<MedAssignment> {
    let medication = crate::repo::medications::get(pool, &req.medication_id).await?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let frequency = req.frequency.unwrap_or(MedFrequency { times: vec![] });
    let optional = req.optional.unwrap_or(false);

    sqlx::query(
        "INSERT INTO med_assignments
         (id, medication_id, pet_id, dosage, frequency_json, date_from, date_to, optional, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&req.medication_id)
    .bind(medication.pet_id)
    .bind(&req.dosage)
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

    let end_date = day_before(&req.effective_from).ok_or_else(|| {
        AppError::BadRequest("invalid effective_from date".into())
    })?;
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
            dosage: req.dosage,
            frequency: req.frequency,
            date_from: req.effective_from,
            date_to: req.date_to,
            optional: req.optional.or(Some(existing.optional)),
        },
    )
    .await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM med_assignments WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Med assignment {id} not found")));
    }
    Ok(())
}
