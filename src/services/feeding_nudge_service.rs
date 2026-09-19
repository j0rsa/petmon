use crate::embedding::ServiceContext;
use chrono::{DateTime, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use sqlx::SqlitePool;

use crate::domain::nutrition_record::NutritionRecordFilters;
use crate::domain::nutrition_status::{
    feeding_windows_in_slot, parse_hhmm, parse_schedule_kind, parse_schedule_windows,
    schedule_projection_at, ScheduleWindow,
};
use crate::error::AppResult;
use crate::repo::{nutrition_records, nutrition_schedules, pets};
use crate::services::{notification_service, nutrition_status_service};

/// Spawn the feeding-reminder worker. It runs immediately (catch-up after
/// restart), then wakes every minute. A reminder fires when a
/// scheduled feeding time falls in the current slot and intake is still below
/// the cumulative schedule projection (same curve as the fluid chart).
pub fn spawn(pool: SqlitePool, timezone: Tz) {
    spawn_with_context(ServiceContext::standalone(pool, timezone));
}

pub fn spawn_with_context(context: ServiceContext) {
    tokio::spawn(async move {
        loop {
            if let Err(e) = run_feeding_nudge_check_at(&context, context.runtime.now()).await {
                tracing::warn!(error = %e, "feeding nudge check failed");
            }
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}

/// A wall-clock time skipped by a DST jump is caught up at the next worker
/// check. Repeated-hour slots retain the same date/window deduplication key.
fn due_windows(windows: &[ScheduleWindow], now: DateTime<Tz>) -> Vec<&ScheduleWindow> {
    let minutes = now.hour() as i32 * 60 + now.minute() as i32;
    let mut due = feeding_windows_in_slot(windows, minutes);
    for window in windows {
        let Some(at) = parse_hhmm(&window.from) else {
            continue;
        };
        if window.max <= 0.0 || at > minutes || due.iter().any(|item| item.from == window.from) {
            continue;
        }
        let local = now
            .date_naive()
            .and_hms_opt((at / 60) as u32, (at % 60) as u32, 0)
            .expect("validated HH:MM");
        if matches!(
            now.timezone().from_local_datetime(&local),
            chrono::LocalResult::None
        ) {
            due.push(window);
        }
    }
    due
}

/// For every active schedule with `notify`, send at most one reminder per
/// scheduled feeding time per day when that slot's cumulative target is unmet.
pub async fn run_feeding_nudge_check(pool: &SqlitePool, now_local: DateTime<Tz>) -> AppResult<()> {
    run_feeding_nudge_check_at(
        &ServiceContext::standalone(pool.clone(), now_local.timezone()),
        now_local.with_timezone(&Utc),
    )
    .await
}

pub async fn run_feeding_nudge_check_at(
    pool: &ServiceContext,
    now: DateTime<Utc>,
) -> AppResult<()> {
    let schedules = nutrition_schedules::list_notify_enabled(pool).await?;
    for schedule in schedules {
        let timezone = match pool.timezone(schedule.pet_id).await {
            Ok(timezone) => timezone,
            Err(error) => {
                tracing::warn!(pet_id = %schedule.pet_id, %error, "feeding runtime resolution failed; pet skipped");
                continue;
            }
        };
        let now_local = now.with_timezone(&timezone);
        let local_date = now_local.format("%Y-%m-%d").to_string();
        let as_of = now_local.format("%Y-%m-%dT%H:%M:%S").to_string();
        let at_minutes = now_local.hour() as i32 * 60 + now_local.minute() as i32;
        let windows = parse_schedule_windows(&schedule.rules_json);
        let due_now = due_windows(&windows, now_local);
        if due_now.is_empty() {
            continue;
        }

        let filters = NutritionRecordFilters {
            pet_id: Some(schedule.pet_id),
            date: Some(local_date.clone()),
            date_from: None,
            date_to: None,
            category: None,
            limit: None,
            offset: None,
        };
        let records = match nutrition_records::list_records(pool, &filters).await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::warn!(
                    pet_id = %schedule.pet_id,
                    error = %e,
                    "feeding_nudge: failed to load records"
                );
                continue;
            }
        };
        let intake = match nutrition_status_service::accumulate_intake(&records, &as_of, now) {
            Ok(intake) => intake,
            Err(error) => {
                tracing::warn!(%error, pet_id = %schedule.pet_id, "feeding intake cutoff failed; pet skipped");
                continue;
            }
        };
        let kind = parse_schedule_kind(&schedule.rules_json);
        // Liquid: total known fluid (chart `total`). Food: grams.
        let actual = intake.amount_for(kind);

        let pet_name = match pets::get_pet(pool, schedule.pet_id).await {
            Ok(pet) => pet.name,
            Err(_) => schedule.pet_id.to_string(),
        };

        let (expected, _, _) = schedule_projection_at(&windows, at_minutes);
        if actual >= expected {
            continue;
        }

        for window in due_now {
            tracing::info!(
                pet_id = %schedule.pet_id,
                schedule_id = %schedule.id,
                window = %window.from,
                kind = kind.noun(),
                actual,
                expected,
                "sending feeding reminder"
            );

            if let Err(e) = notification_service::notify_feeding_nudge(
                pool,
                &schedule,
                &pet_name,
                kind,
                &local_date,
                &window.from,
            )
            .await
            {
                tracing::warn!(
                    error = %e,
                    schedule_id = %schedule.id,
                    "feeding_nudge: notify failed"
                );
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn missing_dst_window_catches_up_but_an_ordinary_missed_window_does_not() {
        let windows = vec![ScheduleWindow {
            from: "02:30".into(),
            to: None,
            min: 1.0,
            max: 10.0,
            note: None,
        }];
        let after_gap = chrono_tz::Europe::Berlin
            .with_ymd_and_hms(2026, 3, 29, 3, 0, 0)
            .unwrap();
        assert_eq!(due_windows(&windows, after_gap).len(), 1);
        let ordinary = chrono_tz::Europe::Berlin
            .with_ymd_and_hms(2026, 3, 30, 3, 0, 0)
            .unwrap();
        assert!(due_windows(&windows, ordinary).is_empty());
        let repeated = chrono_tz::Europe::Berlin.with_ymd_and_hms(2026, 10, 25, 2, 31, 0);
        assert_eq!(due_windows(&windows, repeated.earliest().unwrap()).len(), 1);
        assert_eq!(due_windows(&windows, repeated.latest().unwrap()).len(), 1);
    }
}
