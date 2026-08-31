use chrono::{Timelike, Utc};
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::medication::assignment_due_on;
use crate::domain::push::PushPayload;
use crate::domain::user_settings::{MedNudgeSettings, MED_NUDGE_KEY};
use crate::error::AppResult;
use crate::repo::{med_intake_records, user_settings};
use crate::services::{medication_service, push_service};

/// Spawn the background nudge scheduler. It wakes at the top of every hour,
/// calls `run_nudge_check` for that hour, and sleeps again. Uses `tokio::time`
/// so it stays in sync with wall-clock hours even if the check takes a second.
pub fn spawn(pool: SqlitePool, timezone: Tz) {
    tokio::spawn(async move {
        loop {
            // Sleep until the next full hour boundary
            let now = Utc::now();
            let secs_into_hour = now.minute() * 60 + now.second();
            let secs_until_next_hour = 3600u64.saturating_sub(u64::from(secs_into_hour));
            tokio::time::sleep(std::time::Duration::from_secs(secs_until_next_hour)).await;

            let hour = Utc::now().with_timezone(&timezone).hour() as u8;
            tracing::debug!(hour, "running nudge check");
            if let Err(e) = run_nudge_check(&pool, hour, timezone).await {
                tracing::warn!(error = %e, hour, "nudge check failed");
            }
        }
    });
}

/// Return the sorted set of unique `deadline_hour` values across all users/pets
/// that have at least one enabled nudge slot. The cron operator schedules one
/// job per returned hour.
pub async fn nudge_hours(pool: &SqlitePool) -> AppResult<Vec<u8>> {
    let all: Vec<(String, MedNudgeSettings)> =
        user_settings::list_all_by_key(pool, MED_NUDGE_KEY).await?;

    let mut hours: std::collections::BTreeSet<u8> = std::collections::BTreeSet::new();
    for (_, settings) in all {
        for schedule in settings.pets.values() {
            for slot in [&schedule.morning, &schedule.midday, &schedule.evening] {
                if slot.enabled {
                    hours.insert(slot.deadline_hour);
                }
            }
        }
    }
    Ok(hours.into_iter().collect())
}

/// Run the nudge check for the given `hour`. For every user/pet that has at
/// least one enabled slot with `deadline_hour <= hour`, find all scheduled
/// meds that should have been taken by now but haven't been, and send a push.
pub async fn run_nudge_check(pool: &SqlitePool, hour: u8, timezone: Tz) -> AppResult<()> {
    let today = Utc::now()
        .with_timezone(&timezone)
        .format("%Y-%m-%d")
        .to_string();

    let all: Vec<(String, MedNudgeSettings)> =
        user_settings::list_all_by_key(pool, MED_NUDGE_KEY).await?;

    for (reader_key, settings) in &all {
        for (pet_id_str, schedule) in &settings.pets {
            let pet_id = match Uuid::parse_str(pet_id_str) {
                Ok(id) => id,
                Err(_) => continue,
            };

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

            let daily = match medication_service::daily_assignments(pool, pet_id, &today).await {
                Ok(d) => d,
                Err(e) => {
                    tracing::warn!(pet_id = %pet_id, error = %e, "nudge_check: failed to load daily assignments");
                    continue;
                }
            };

            let taken_today = match med_intake_records::taken_counts_on(pool, pet_id, &today).await
            {
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

                // Doses expected from the passed time slots
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
                    // This med has no doses scheduled in the passed slots
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

            // De-duplicate in case the same med appears multiple times
            missing.sort();
            missing.dedup();
            let med_list = missing.join(", ");

            tracing::info!(
                reader_key = %reader_key,
                pet_id = %pet_id,
                hour,
                missing = %med_list,
                "sending nudge"
            );

            let payload = PushPayload {
                title: format!("Medication reminder · {pet_name}"),
                body: format!("Don't forget to give {med_list} to {pet_name} in time"),
                url: "/health".to_string(),
                notification_id: None,
            };

            push_service::send_to_reader(pool, reader_key, &payload).await;
        }
    }

    Ok(())
}
