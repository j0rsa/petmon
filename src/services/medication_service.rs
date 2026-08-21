use crate::domain::medication::{
    assignment_due_on, CreateMedAssignment, CreateMedIntakeRecord, CreateMedication,
    DailyMedAssignment, MedAssignment, MedAssignmentFilters, MedIntakeRecord,
    MedIntakeRecordFilters, Medication, ReviseMedAssignment, UpdateMedication,
};
use crate::domain::settings::DateFormat;
use crate::error::{AppError, AppResult};
use crate::repo::{med_assignments, med_intake_records, medications, pets};
use crate::services::telegram;
use chrono_tz::Tz;
use sqlx::SqlitePool;
use tracing::Instrument;
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
    date_format: DateFormat,
) -> AppResult<MedIntakeRecord> {
    let delayed = req.occurred_at.is_some();
    pets::get_pet(
        pool,
        Uuid::parse_str(&req.pet_id)
            .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?,
    )
    .await
    .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;
    let record = med_intake_records::create(pool, req, timezone).await?;
    let pool2 = pool.clone();
    let record2 = record.clone();
    tokio::spawn(
        async move {
            telegram::notify_medication_intake(&pool2, &record2, delayed, date_format).await
        }
            .instrument(tracing::Span::current()),
    );
    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn delete_intake(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let record = med_intake_records::get(pool, id).await?;
    med_intake_records::delete(pool, id).await?;
    if record.telegram_message_id.is_some() {
        let pool2 = pool.clone();
        tokio::spawn(
            async move { telegram::notify_medication_intake_delete(&pool2, &record).await }
                .instrument(tracing::Span::current()),
        );
    }
    Ok(())
}
