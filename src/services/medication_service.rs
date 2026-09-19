use crate::domain::medication::{
    assignment_due_on, CreateMedAssignment, CreateMedBundle, CreateMedBundleIntake,
    CreateMedIntakeRecord, CreateMedication, DailyMedAssignment, EditMedAssignment,
    EndMedAssignment, MedAssignment, MedAssignmentFilters, MedBundle, MedIntakeRecord,
    MedIntakeRecordFilters, Medication, ReviseMedAssignment, UpdateMedBundle, UpdateMedication,
};
use crate::domain::user_settings::UserDisplaySettings;
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::{AppError, AppResult};
use crate::repo::{med_assignments, med_bundles, med_intake_records, medications, pets};
use crate::services::telegram;
use chrono_tz::Tz;
use std::collections::HashSet;
use tracing::Instrument;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn list_medications(pool: &ServiceContext, pet_id: Uuid) -> AppResult<Vec<Medication>> {
    pool.check(Some(pet_id), ResourceAction::View).await?;

    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {pet_id} not found")))?;
    medications::list_by_pet(pool, pet_id).await
}

#[tracing::instrument(skip(pool))]
pub async fn get_medication(pool: &ServiceContext, id: &str) -> AppResult<Medication> {
    let owner = medications::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::View).await?;

    medications::get(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create_medication(
    pool: &ServiceContext,
    req: CreateMedication,
) -> AppResult<Medication> {
    pool.check_str(&req.pet_id, ResourceAction::WriteRecords)
        .await?;

    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;
    medications::create(pool, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn update_medication(
    pool: &ServiceContext,
    id: &str,
    req: UpdateMedication,
) -> AppResult<Medication> {
    let owner = medications::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    medications::update(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete_medication(pool: &ServiceContext, id: &str) -> AppResult<()> {
    let owner = medications::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    med_bundles::delete_containing_medication(pool, id).await?;
    medications::delete(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn list_assignments(
    pool: &ServiceContext,
    filters: MedAssignmentFilters,
) -> AppResult<Vec<MedAssignment>> {
    med_assignments::list_scoped(
        pool,
        &filters,
        &pool.visibility_str(filters.pet_id.as_deref()).await?,
    )
    .await
}

#[tracing::instrument(skip(pool))]
pub async fn create_assignment(
    pool: &ServiceContext,
    req: CreateMedAssignment,
) -> AppResult<MedAssignment> {
    let owner = medications::get(pool, &req.medication_id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;
    validate_formulation_reference(pool, &req.medication_id, req.formulation_id.as_deref()).await?;

    medications::get(pool, &req.medication_id).await?;
    med_assignments::create(pool, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn revise_assignment(
    pool: &ServiceContext,
    id: &str,
    req: ReviseMedAssignment,
) -> AppResult<MedAssignment> {
    let owner = med_assignments::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;
    validate_formulation_reference(pool, &owner.medication_id, req.formulation_id.as_deref())
        .await?;

    med_assignments::revise(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn end_assignment(
    pool: &ServiceContext,
    id: &str,
    req: EndMedAssignment,
    _timezone: Tz,
) -> AppResult<MedAssignment> {
    let owner = med_assignments::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;
    let timezone = pool.timezone(owner.pet_id).await?;

    let today = pool
        .runtime
        .now()
        .with_timezone(&timezone)
        .date_naive()
        .to_string();
    med_assignments::end_on(pool, id, req, &today).await
}

pub async fn edit_assignment(
    pool: &ServiceContext,
    id: &str,
    req: EditMedAssignment,
) -> AppResult<MedAssignment> {
    let owner = med_assignments::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;
    validate_formulation_reference(pool, &owner.medication_id, req.formulation_id.as_deref())
        .await?;

    med_assignments::update_in_place(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete_assignment(pool: &ServiceContext, id: &str, cascade: bool) -> AppResult<()> {
    let owner = med_assignments::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    let intakes = med_intake_records::list_for_assignment(pool, id).await?;
    if !intakes.is_empty() && !cascade {
        return Err(AppError::BadRequest(
            "cannot delete assignment with intake records without cascade=true".into(),
        ));
    }
    if cascade {
        med_intake_records::delete_for_assignment(pool, id).await?;
        let to_notify: Vec<_> = intakes
            .into_iter()
            .filter(|record| record.telegram_message_id.is_some())
            .collect();
        if !to_notify.is_empty() {
            let pool2 = pool.clone();
            tokio::spawn(
                async move {
                    for record in to_notify {
                        telegram::notify_medication_intake_delete(&pool2, &record).await;
                    }
                }
                .instrument(tracing::Span::current()),
            );
        }
    }
    med_assignments::delete(pool, id).await?;
    Ok(())
}

#[tracing::instrument(skip(pool))]
pub async fn list_formulations(
    pool: &ServiceContext,
    medication_id: &str,
) -> AppResult<Vec<crate::domain::medication::MedFormulation>> {
    let owner = medications::get(pool, medication_id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::View).await?;

    medications::get(pool, medication_id).await?;
    crate::repo::med_formulations::list_for_medication(pool, medication_id).await
}

#[tracing::instrument(skip(pool))]
pub async fn daily_assignments(
    pool: &ServiceContext,
    pet_id: Uuid,
    date: &str,
) -> AppResult<Vec<DailyMedAssignment>> {
    pool.check(Some(pet_id), ResourceAction::View).await?;

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
    pool: &ServiceContext,
    filters: MedIntakeRecordFilters,
) -> AppResult<Vec<MedIntakeRecord>> {
    med_intake_records::list_scoped(
        pool,
        &filters,
        &pool.visibility_str(filters.pet_id.as_deref()).await?,
    )
    .await
}

#[tracing::instrument(skip(pool))]
pub async fn create_intake(
    pool: &ServiceContext,
    req: CreateMedIntakeRecord,
    _timezone: Tz,
    display_settings: UserDisplaySettings,
) -> AppResult<MedIntakeRecord> {
    let authorized_pet = pool
        .check_str(&req.pet_id, ResourceAction::WriteRecords)
        .await?;
    let medication = medications::get(pool, &req.medication_id).await?;
    pool.check(Some(medication.pet_id), ResourceAction::WriteRecords)
        .await?;
    if medication.pet_id != authorized_pet {
        return Err(AppError::BadRequest(
            "medication does not belong to the given pet".into(),
        ));
    }
    if let Some(assignment_id) = &req.assignment_id {
        let assignment = med_assignments::get(pool, assignment_id).await?;
        pool.check(Some(assignment.pet_id), ResourceAction::WriteRecords)
            .await?;
        if assignment.pet_id != authorized_pet || assignment.medication_id != medication.id {
            return Err(AppError::BadRequest(
                "assignment does not belong to this medication and pet".into(),
            ));
        }
    }
    let timezone = pool.timezone(authorized_pet).await?;

    let delayed = intake_is_delayed(&req.occurred_at, &req.local_date);
    let mut req = req;
    if req.occurred_at.is_none() {
        req.occurred_at = Some(pool.record_timestamp(timezone, req.local_date.as_deref())?);
    }
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
            telegram::notify_medication_intake(&pool2, &record2, delayed, display_settings).await
        }
        .instrument(tracing::Span::current()),
    );
    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn delete_intake(pool: &ServiceContext, id: &str) -> AppResult<()> {
    let owner = med_intake_records::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

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

fn intake_is_delayed(occurred_at: &Option<String>, local_date: &Option<String>) -> bool {
    occurred_at.as_ref().is_some_and(|s| !s.trim().is_empty())
        || local_date.as_ref().is_some_and(|s| !s.trim().is_empty())
}

#[tracing::instrument(skip(pool))]
pub async fn list_bundles(pool: &ServiceContext, pet_id: Uuid) -> AppResult<Vec<MedBundle>> {
    pool.check(Some(pet_id), ResourceAction::View).await?;

    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {pet_id} not found")))?;
    med_bundles::list_by_pet(pool, pet_id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create_bundle(pool: &ServiceContext, req: CreateMedBundle) -> AppResult<MedBundle> {
    pool.check_str(&req.pet_id, ResourceAction::WriteRecords)
        .await?;

    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    pets::get_pet(pool, pet_id)
        .await
        .map_err(|_| AppError::BadRequest(format!("Pet {} not found", req.pet_id)))?;
    if req.assignment_ids.len() < 2 {
        return Err(AppError::BadRequest(
            "a bundle must contain at least 2 assignments".into(),
        ));
    }
    let mut seen_assignments = HashSet::new();
    let mut seen_medications = HashSet::new();
    let mut members = Vec::with_capacity(req.assignment_ids.len());
    for assignment_id in &req.assignment_ids {
        if !seen_assignments.insert(assignment_id) {
            return Err(AppError::BadRequest(
                "a bundle must contain distinct assignments".into(),
            ));
        }
        let assignment = med_assignments::get(pool, assignment_id).await?;
        pool.check(Some(assignment.pet_id), ResourceAction::WriteRecords)
            .await?;
        if assignment.pet_id != pet_id {
            return Err(AppError::BadRequest(
                "assignments must belong to the given pet".into(),
            ));
        }
        if assignment.optional {
            return Err(AppError::BadRequest(
                "bundles can only include scheduled assignments, not optional ones".into(),
            ));
        }
        if !seen_medications.insert(assignment.medication_id.clone()) {
            return Err(AppError::BadRequest(
                "a bundle must contain distinct medications".into(),
            ));
        }
        members.push(medications::get(pool, &assignment.medication_id).await?);
    }
    let name = req
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            members
                .iter()
                .map(|medication| medication.name.as_str())
                .collect::<Vec<_>>()
                .join(" + ")
        });
    med_bundles::create(pool, pet_id, name, &members).await
}

async fn validate_formulation_reference(
    context: &ServiceContext,
    medication_id: &str,
    formulation_id: Option<&str>,
) -> AppResult<()> {
    if let Some(id) = formulation_id {
        let formulation = crate::repo::med_formulations::get(context, id).await?;
        let medication = medications::get(context, &formulation.medication_id).await?;
        context
            .check(Some(medication.pet_id), ResourceAction::WriteRecords)
            .await?;
        if formulation.medication_id != medication_id {
            return Err(AppError::BadRequest(
                "formulation does not belong to this medication".into(),
            ));
        }
    }
    Ok(())
}

#[tracing::instrument(skip(pool))]
pub async fn update_bundle(
    pool: &ServiceContext,
    id: &str,
    req: UpdateMedBundle,
) -> AppResult<MedBundle> {
    let owner = med_bundles::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    let name = req
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| AppError::BadRequest("name is required".into()))?;
    med_bundles::update_name(pool, id, name).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete_bundle(pool: &ServiceContext, id: &str) -> AppResult<()> {
    let owner = med_bundles::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;

    med_bundles::delete(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create_bundle_intake(
    pool: &ServiceContext,
    id: &str,
    req: CreateMedBundleIntake,
    _timezone: Tz,
    display_settings: UserDisplaySettings,
) -> AppResult<Vec<MedIntakeRecord>> {
    let owner = med_bundles::get(pool, id).await?;
    pool.check(Some(owner.pet_id), ResourceAction::WriteRecords)
        .await?;
    let timezone = pool.timezone(owner.pet_id).await?;

    let delayed = intake_is_delayed(&req.occurred_at, &req.local_date);
    let bundle = med_bundles::get(pool, id).await?;
    let time = crate::record_time::resolve(
        req.occurred_at.as_deref(),
        req.local_date.as_deref(),
        timezone,
        pool.runtime.now(),
    )?;
    let occurred_at = time.utc;
    let local_date = time.local_date;
    let mut records = Vec::with_capacity(bundle.items.len());
    for item in &bundle.items {
        match med_intake_records::create(
            pool,
            CreateMedIntakeRecord {
                pet_id: bundle.pet_id.to_string(),
                medication_id: item.medication_id.clone(),
                assignment_id: None,
                dose_fraction_override: None,
                liquid_dose_ml_override: None,
                taken: Some(true),
                occurred_at: Some(occurred_at.clone()),
                local_date: Some(local_date.clone()),
                note: req.note.clone(),
                source_type: req.source_type.clone(),
            },
            timezone,
        )
        .await
        {
            Ok(record) => records.push(record),
            Err(err) => {
                for created in &records {
                    let _ = med_intake_records::delete(pool, &created.id).await;
                }
                return Err(err);
            }
        }
    }
    let pool2 = pool.clone();
    let records2 = records.clone();
    tokio::spawn(
        async move {
            telegram::notify_medication_bundle_intake(&pool2, &records2, delayed, display_settings)
                .await
        }
        .instrument(tracing::Span::current()),
    );
    Ok(records)
}

/// Adapter for device requests that carry both pet and bundle IDs.
pub async fn create_bundle_intake_for_pet(
    context: &ServiceContext,
    pet_id: Uuid,
    bundle_id: &str,
    req: CreateMedBundleIntake,
    timezone: Tz,
    display_settings: UserDisplaySettings,
) -> AppResult<Vec<MedIntakeRecord>> {
    context
        .check(Some(pet_id), ResourceAction::WriteRecords)
        .await?;
    let bundle = med_bundles::get(context, bundle_id).await?;
    context
        .check(Some(bundle.pet_id), ResourceAction::WriteRecords)
        .await?;
    if bundle.pet_id != pet_id {
        return Err(AppError::BadRequest(
            "bundle does not belong to the given pet".into(),
        ));
    }
    create_bundle_intake(context, bundle_id, req, timezone, display_settings).await
}
