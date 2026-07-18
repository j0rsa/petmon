use crate::domain::nutrition_record::{NutritionCategory, NutritionRecordFilters};
use crate::domain::nutrition_schedule::NutritionSchedule;
use crate::domain::nutrition_status::{
    parse_liquid_schedule_windows, schedule_projection_at, NutritionStatus,
    NutritionStatusIntake, NutritionStatusSchedule, WET_FOOD_FLUID_RATIO,
};
use crate::error::{AppError, AppResult};
use crate::repo::{nutrition_records, nutrition_schedules, pets};
use chrono::{DateTime, NaiveDateTime, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

#[tracing::instrument(skip(pool))]
pub async fn get_status(
    pool: &SqlitePool,
    pet_id: Uuid,
    ts: Option<&str>,
    timezone: Tz,
) -> AppResult<NutritionStatus> {
    pets::get_pet(pool, pet_id).await?;

    let (as_of, at_minutes) = resolve_as_of(ts, timezone)?;
    let local_date = as_of
        .split('T')
        .next()
        .ok_or_else(|| AppError::BadRequest("invalid as_of timestamp".to_string()))?
        .to_string();

    let filters = NutritionRecordFilters {
        pet_id: Some(pet_id),
        date: Some(local_date.clone()),
        date_from: None,
        date_to: None,
        category: None,
        limit: None,
        offset: None,
    };
    let records = nutrition_records::list_records(pool, &filters).await?;
    let schedules = nutrition_schedules::list_schedules(pool, Some(pet_id)).await?;

    let intake = accumulate_intake(&records, &as_of);
    let schedule = build_schedule_status(&schedules, at_minutes, intake.direct_liquid_ml);
    let on_track = schedule.as_ref().map(|s| s.delta_ml >= 0.0);

    Ok(NutritionStatus {
        pet_id,
        local_date,
        as_of,
        on_track,
        intake,
        schedule,
    })
}

fn resolve_as_of(ts: Option<&str>, timezone: Tz) -> AppResult<(String, i32)> {
    let dt = match ts {
        None => Utc::now().with_timezone(&timezone),
        Some(value) => parse_ts(value, timezone)?,
    };
    let as_of = dt.format("%Y-%m-%dT%H:%M:%S").to_string();
    let at_minutes = dt.hour() as i32 * 60 + dt.minute() as i32;
    Ok((as_of, at_minutes))
}

fn parse_ts(value: &str, timezone: Tz) -> AppResult<DateTime<Tz>> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return Ok(parsed.with_timezone(&timezone));
    }

    let naive = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S").map_err(|_| {
        AppError::BadRequest(format!(
            "invalid ts: expected RFC3339 or YYYY-MM-DDTHH:MM:SS, got {value}"
        ))
    })?;

    timezone
        .from_local_datetime(&naive)
        .single()
        .ok_or_else(|| AppError::BadRequest(format!("ambiguous local timestamp: {value}")))
}

fn accumulate_intake(records: &[crate::domain::nutrition_record::NutritionRecord], as_of: &str) -> NutritionStatusIntake {
    let mut liquids_ml = 0.0;
    let mut water_ml = 0.0;
    let mut wet_food_g = 0.0;
    let mut dry_food_g = 0.0;

    for record in records {
        if record.occurred_at.as_str() > as_of {
            continue;
        }
        match record.category {
            NutritionCategory::Liquids => liquids_ml += record.amount,
            NutritionCategory::Water => water_ml += record.amount,
            NutritionCategory::WetFood => wet_food_g += record.amount,
            NutritionCategory::DryFood => dry_food_g += record.amount,
        }
    }

    let wet_food_fluid_ml = (wet_food_g * WET_FOOD_FLUID_RATIO).round();
    let direct_liquid_ml = liquids_ml + water_ml;
    let total_known_fluid_ml = wet_food_fluid_ml + direct_liquid_ml;

    NutritionStatusIntake {
        liquids_ml,
        water_ml,
        direct_liquid_ml,
        wet_food_g,
        wet_food_fluid_ml,
        dry_food_g,
        total_known_fluid_ml,
    }
}

fn select_liquid_schedule<'a>(schedules: &'a [NutritionSchedule]) -> Option<&'a NutritionSchedule> {
    schedules
        .iter()
        .find(|schedule| schedule.active && schedule.rules_json.contains("\"type\":\"liquid\""))
        .or_else(|| {
            schedules
                .iter()
                .find(|schedule| schedule.rules_json.contains("\"type\":\"liquid\""))
        })
}

fn build_schedule_status(
    schedules: &[NutritionSchedule],
    at_minutes: i32,
    direct_liquid_ml: f64,
) -> Option<NutritionStatusSchedule> {
    let schedule = select_liquid_schedule(schedules)?;
    let windows = parse_liquid_schedule_windows(&schedule.rules_json);
    if windows.is_empty() {
        return None;
    }

    let (expected_ml, daily_min_ml, daily_max_ml) =
        schedule_projection_at(&windows, at_minutes);

    Some(NutritionStatusSchedule {
        schedule_id: schedule.id.clone(),
        schedule_name: schedule.name.clone(),
        expected_ml,
        daily_min_ml,
        daily_max_ml,
        delta_ml: direct_liquid_ml - expected_ml,
    })
}

pub fn on_track_summary(status: &NutritionStatus) -> serde_json::Value {
    use serde_json::json;

    let summary = match (status.on_track, status.schedule.as_ref()) {
        (Some(true), Some(schedule)) if schedule.delta_ml > 0.0 => format!(
            "{:.0} ml ahead of the liquid schedule",
            schedule.delta_ml
        ),
        (Some(true), Some(_)) => "On track with the liquid schedule".to_string(),
        (Some(false), Some(schedule)) => format!(
            "{:.0} ml behind the liquid schedule",
            schedule.delta_ml.abs()
        ),
        (None, _) => "No liquid schedule configured".to_string(),
        _ => "Unable to determine on-track status".to_string(),
    };

    json!({
        "pet_id": status.pet_id,
        "local_date": status.local_date,
        "as_of": status.as_of,
        "on_track": status.on_track,
        "direct_liquid_ml": status.intake.direct_liquid_ml,
        "expected_ml": status.schedule.as_ref().map(|schedule| schedule.expected_ml),
        "delta_ml": status.schedule.as_ref().map(|schedule| schedule.delta_ml),
        "summary": summary,
    })
}
