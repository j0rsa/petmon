use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const WET_FOOD_FLUID_RATIO: f64 = 0.77;

#[derive(Debug, Clone, Serialize)]
pub struct NutritionStatus {
    pub pet_id: Uuid,
    pub local_date: String,
    pub as_of: String,
    pub intake: NutritionStatusIntake,
    pub schedule: Option<NutritionStatusSchedule>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NutritionStatusIntake {
    pub liquids_ml: f64,
    pub water_ml: f64,
    pub direct_liquid_ml: f64,
    pub wet_food_g: f64,
    pub wet_food_fluid_ml: f64,
    pub dry_food_g: f64,
    pub total_known_fluid_ml: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct NutritionStatusSchedule {
    pub schedule_id: String,
    pub schedule_name: String,
    pub expected_ml: f64,
    pub daily_min_ml: f64,
    pub daily_max_ml: f64,
    pub delta_ml: f64,
}

#[derive(Debug, Clone, Deserialize)]
struct ParsedScheduleRules {
    #[serde(rename = "type")]
    schedule_type: Option<String>,
    windows: Option<Vec<ScheduleWindow>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ScheduleWindow {
    pub from: String,
    pub to: String,
    pub min: f64,
    pub max: f64,
    pub note: Option<String>,
}

pub fn parse_liquid_schedule_windows(rules_json: &str) -> Vec<ScheduleWindow> {
    let Ok(parsed) = serde_json::from_str::<ParsedScheduleRules>(rules_json) else {
        return Vec::new();
    };
    if parsed.schedule_type.as_deref() != Some("liquid") {
        return Vec::new();
    }
    parsed.windows.unwrap_or_default()
}

pub fn parse_hhmm(time: &str) -> Option<i32> {
    let (hours, minutes) = time.split_once(':')?;
    let hours: i32 = hours.parse().ok()?;
    let minutes: i32 = minutes.parse().ok()?;
    if !(0..=23).contains(&hours) || !(0..=59).contains(&minutes) {
        return None;
    }
    Some(hours * 60 + minutes)
}

pub fn window_midpoint_minutes(from: &str, to: &str) -> Option<i32> {
    let from_m = parse_hhmm(from)?;
    let to_m = parse_hhmm(to)?;
    Some(((from_m + to_m) as f64 / 2.0).round() as i32)
}

/// Cumulative schedule expectation at a time-of-day, matching the frontend
/// `buildScheduleCurve` midpoint stepping logic.
pub fn schedule_projection_at(
    windows: &[ScheduleWindow],
    at_minutes: i32,
) -> (f64, f64, f64) {
    let daily_min_ml: f64 = windows.iter().map(|w| w.min).sum();
    let daily_max_ml: f64 = windows.iter().map(|w| w.max).sum();

    let mut active: Vec<&ScheduleWindow> = windows.iter().filter(|w| w.max > 0.0).collect();
    active.sort_by(|left, right| left.from.cmp(&right.from));

    let mut expected_ml = 0.0;
    for window in active {
        let Some(midpoint) = window_midpoint_minutes(&window.from, &window.to) else {
            continue;
        };
        if at_minutes >= midpoint {
            expected_ml += window.max;
        }
    }

    (expected_ml, daily_min_ml, daily_max_ml)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_projection_steps_at_window_midpoints() {
        let windows = vec![
            ScheduleWindow {
                from: "08:00".to_string(),
                to: "10:00".to_string(),
                min: 10.0,
                max: 100.0,
                note: None,
            },
            ScheduleWindow {
                from: "12:00".to_string(),
                to: "14:00".to_string(),
                min: 20.0,
                max: 50.0,
                note: None,
            },
        ];

        assert_eq!(schedule_projection_at(&windows, 8 * 60 + 59), (0.0, 30.0, 150.0));
        assert_eq!(schedule_projection_at(&windows, 9 * 60), (100.0, 30.0, 150.0));
        assert_eq!(schedule_projection_at(&windows, 12 * 60 + 59), (100.0, 30.0, 150.0));
        assert_eq!(schedule_projection_at(&windows, 13 * 60), (150.0, 30.0, 150.0));
    }

    #[test]
    fn parse_liquid_schedule_windows_ignores_food_schedules() {
        let rules = r#"{"type":"food","windows":[{"from":"08:00","to":"09:00","min":1,"max":2}]}"#;
        assert!(parse_liquid_schedule_windows(rules).is_empty());
    }
}
