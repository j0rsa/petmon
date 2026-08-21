use crate::domain::medication::{
    assignment_due_on, CreateMedAssignment, CreateMedIntakeRecord, CreateMedication,
    DailyMedAssignment, MedAssignment, MedAssignmentFilters, MedIntakeRecord,
    MedIntakeRecordFilters, Medication, ReviseMedAssignment, UpdateMedication,
};
use crate::error::{AppError, AppResult};
use crate::repo::{med_assignments, med_intake_records, medications, pets};
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list_medications(pool: &SqlitePool, pet_id: Uuid) -> AppResult<Vec<Medication>> {
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {pet_id} not found")))?;
    medications::list_by_pet(pool, pet_id).await
}

#[tracing::instrument(skip(pool))]
pub async fn get_medication(pool: &SqlitePool, id: &str) -> AppResult<Medication> {
    medications::get(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create_medication(pool: &SqlitePool, req: CreateMedication) -> AppResult<Medication> {
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;
    medications::create(pool, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn update_medication(
    pool: &SqlitePool,
    id: &str,
    req: UpdateMedication,
) -> AppResult<Medication> {
    medications::update(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete_medication(pool: &SqlitePool, id: &str) -> AppResult<()> {
    medications::delete(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn list_assignments(
    pool: &SqlitePool,
    filters: MedAssignmentFilters,
) -> AppResult<Vec<MedAssignment>> {
    med_assignments::list(pool, &filters).await
}

#[tracing::instrument(skip(pool))]
pub async fn create_assignment(
    pool: &SqlitePool,
    req: CreateMedAssignment,
) -> AppResult<MedAssignment> {
    medications::get(pool, &req.medication_id).await?;
    med_assignments::create(pool, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn revise_assignment(
    pool: &SqlitePool,
    id: &str,
    req: ReviseMedAssignment,
) -> AppResult<MedAssignment> {
    med_assignments::revise(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn list_formulations(
    pool: &SqlitePool,
    medication_id: &str,
) -> AppResult<Vec<crate::domain::medication::MedFormulation>> {
    medications::get(pool, medication_id).await?;
    crate::repo::med_formulations::list_for_medication(pool, medication_id).await
}

#[tracing::instrument(skip(pool))]
pub async fn daily_assignments(
    pool: &SqlitePool,
    pet_id: Uuid,
    date: &str,
) -> AppResult<Vec<DailyMedAssignment>> {
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {pet_id} not found")))?;

    let meds = medications::list_by_pet(pool, pet_id).await?;
    let intakes = med_intake_records::list(
        pool,
        &MedIntakeRecordFilters {
            pet_id: Some(pet_id.to_string()),
            medication_id: None,
            date_from: Some(date.to_string()),
            date_to: Some(date.to_string()),
            limit: None,
            offset: None,
        },
    )
    .await?;

    let mut result = Vec::new();
    for medication in meds {
        if let Some(assignment) =
            med_assignments::active_for_medication_on(pool, &medication.id, date).await?
        {
            if !assignment.optional && !assignment_due_on(&assignment, date) {
                continue;
            }
            let med_intakes: Vec<MedIntakeRecord> = intakes
                .iter()
                .filter(|r| r.medication_id == medication.id)
                .cloned()
                .collect();
            result.push(DailyMedAssignment {
                medication,
                assignment,
                intakes: med_intakes,
            });
        }
    }
    Ok(result)
}

#[tracing::instrument(skip(pool))]
pub async fn list_intake(
    pool: &SqlitePool,
    filters: MedIntakeRecordFilters,
) -> AppResult<Vec<MedIntakeRecord>> {
    med_intake_records::list(pool, &filters).await
}

#[tracing::instrument(skip(pool))]
pub async fn create_intake(
    pool: &SqlitePool,
    req: CreateMedIntakeRecord,
    timezone: Tz,
) -> AppResult<MedIntakeRecord> {
    pets::get_pet(
        pool,
        Uuid::parse_str(&req.pet_id)
            .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?,
    )
    .await
    .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;
    med_intake_records::create(pool, req, timezone).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete_intake(pool: &SqlitePool, id: &str) -> AppResult<()> {
    med_intake_records::delete(pool, id).await
}
