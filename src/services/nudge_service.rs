use crate::embedding::ServiceContext;
use chrono::{Timelike, Utc};
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::medication::assignment_due_on;
use crate::domain::pet_settings::{PetNudgeSchedule, MED_NUDGE_KEY};
use crate::error::AppResult;
use crate::repo::{med_intake_records, pet_settings};
use crate::services::{medication_service, push_service};

/// Standalone reminder scheduler. It checks local hours on minute ticks, with
/// persistent once-per-pet/date/deadline delivery keys across restart and DST folds.
pub fn spawn(pool: SqlitePool, timezone: Tz) {
    spawn_with_context(ServiceContext::standalone(pool, timezone));
}

/// Retains the embedder's runtime and notification backend for background work.
pub fn spawn_with_context(context: ServiceContext) {
    tokio::spawn(async move {
        loop {
            if let Err(e) = run_nudge_check_at(&context, context.runtime.now(), None).await {
                tracing::warn!(error = %e, "nudge check failed");
            }
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}

/// Return the sorted set of unique `deadline_hour` values across all pets
/// that have at least one enabled nudge slot.
pub async fn nudge_hours(pool: &SqlitePool) -> AppResult<Vec<u8>> {
    let all: Vec<(String, PetNudgeSchedule)> =
        pet_settings::list_all_by_key(pool, MED_NUDGE_KEY).await?;

    let mut hours: std::collections::BTreeSet<u8> = std::collections::BTreeSet::new();
    for (_, schedule) in all {
        for slot in [&schedule.morning, &schedule.midday, &schedule.evening] {
            if slot.enabled {
                hours.insert(slot.deadline_hour);
            }
        }
    }
    Ok(hours.into_iter().collect())
}

/// Run the nudge check for the given `hour`. For every pet that has at least
/// one enabled slot with `deadline_hour <= hour`, find all scheduled meds that
/// should have been taken by now but haven't been, and broadcast a push to all
/// subscribers.
pub async fn run_nudge_check(pool: &SqlitePool, hour: u8, timezone: Tz) -> AppResult<()> {
    run_nudge_check_at(
        &ServiceContext::standalone(pool.clone(), timezone),
        Utc::now(),
        Some(hour),
    )
    .await
}

pub async fn run_nudge_check_at(
    pool: &ServiceContext,
    now: chrono::DateTime<Utc>,
    hour_override: Option<u8>,
) -> AppResult<()> {
    let timezone = pool.timezone().await?;
    let all: Vec<(String, PetNudgeSchedule)> =
        pet_settings::list_all_by_key(pool, MED_NUDGE_KEY).await?;

    for (pet_id_str, schedule) in &all {
        let pet_id = match Uuid::parse_str(pet_id_str) {
            Ok(id) => id,
            Err(_) => continue,
        };
        let local_now = now.with_timezone(&timezone);
        let hour = hour_override.unwrap_or(local_now.hour() as u8);
        let today = local_now.format("%Y-%m-%d").to_string();

        // Which named slots have deadline_hour <= hour and are enabled?
        let passed_slots: Vec<(&'static str, u8)> = [
            (
                "morning",
                schedule.morning.enabled,
                schedule.morning.deadline_hour,
            ),
            (
                "midday",
                schedule.midday.enabled,
                schedule.midday.deadline_hour,
            ),
            (
                "evening",
                schedule.evening.enabled,
                schedule.evening.deadline_hour,
            ),
        ]
        .iter()
        .filter(|(_, enabled, dh)| *enabled && *dh <= hour)
        .map(|(name, _, dh)| (*name, *dh))
        .collect();

        if passed_slots.is_empty() {
            continue;
        }
        // Catch up after downtime or a skipped DST hour, but do not generate a
        // fresh reminder every hour for the same missed dose.
        let due_deadline = passed_slots
            .iter()
            .map(|(_, deadline)| *deadline)
            .max()
            .unwrap();

        let daily = match medication_service::daily_assignments(pool, pet_id, &today).await {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!(pet_id = %pet_id, error = %e, "nudge_check: failed to load daily assignments");
                continue;
            }
        };

        let taken_today = match med_intake_records::taken_counts_on(pool, pet_id, &today).await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!(pet_id = %pet_id, error = %e, "nudge_check: failed to load taken counts");
                continue;
            }
        };

        let mut missing: Vec<String> = Vec::new();

        for item in &daily {
            if item.assignment.optional {
                continue;
            }
            if !assignment_due_on(&item.assignment, &today) {
                continue;
            }

            let expected: u32 = passed_slots
                .iter()
                .map(|(slot_name, _)| match *slot_name {
                    "morning" => u32::from(item.assignment.frequency.morning),
                    "midday" => u32::from(item.assignment.frequency.midday),
                    "evening" => u32::from(item.assignment.frequency.evening),
                    _ => 0,
                })
                .sum();

            if expected == 0 {
                continue;
            }

            let taken = taken_today.get(&item.assignment.id).copied().unwrap_or(0);

            if taken < expected {
                missing.push(item.medication.name.clone());
            }
        }

        if missing.is_empty() {
            continue;
        }

        let pet_name = match crate::repo::pets::get_pet(pool, pet_id).await {
            Ok(pet) => pet.name,
            Err(_) => pet_id_str.clone(),
        };

        missing.sort();
        missing.dedup();
        let med_list = missing.join(", ");

        tracing::info!(
            pet_id = %pet_id,
            hour,
            missing = %med_list,
            "sending nudge broadcast"
        );

        let notification = crate::domain::notification::CreateNotification {
            kind: "med.nudge".to_string(),
            title: format!("Medication reminder · {pet_name}"),
            body: Some(format!(
                "Don't forget to give {med_list} to {pet_name} in time"
            )),
            link_path: "/health".to_string(),
            link_hash: None,
            pet_id: Some(pet_id),
            pet_name: Some(pet_name.clone()),
            source_kind: Some("med_nudge".into()),
            source_id: Some(format!("{pet_id}:{today}:{due_deadline}")),
        };

        if let Some(notification) = pool.notifications.create(pool, notification).await? {
            push_service::spawn_broadcast_context(pool.clone(), notification);
        }
    }

    Ok(())
}
