use serde::{Deserialize, Serialize};

use super::settings::{DateFormat, TimeFormat, WeekStart};

pub const DISPLAY_KEY: &str = "display";
pub const NUTRITION_CALENDAR_KEY: &str = "nutrition_calendar";
pub const CUMULATIVE_FLUID_CHART_KEY: &str = "cumulative_fluid_chart";
pub const DEVELOPER_MODE_KEY: &str = "developer_mode";

/// Per-user display preferences (global UI formatting, page toggles).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserDisplaySettings {
    #[serde(default)]
    pub time_format: TimeFormat,
    #[serde(default)]
    pub date_format: DateFormat,
    #[serde(default = "default_true")]
    pub show_water_card: bool,
}

impl Default for UserDisplaySettings {
    fn default() -> Self {
        UserDisplaySettings {
            time_format: TimeFormat::default(),
            date_format: DateFormat::default(),
            show_water_card: true,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserDisplaySettings {
    pub time_format: Option<TimeFormat>,
    pub date_format: Option<DateFormat>,
    pub show_water_card: Option<bool>,
}

impl UpdateUserDisplaySettings {
    pub fn apply(self, existing: UserDisplaySettings) -> UserDisplaySettings {
        UserDisplaySettings {
            time_format: self.time_format.unwrap_or(existing.time_format),
            date_format: self.date_format.unwrap_or(existing.date_format),
            show_water_card: self.show_water_card.unwrap_or(existing.show_water_card),
        }
    }
}

/// Per-user nutrition journal calendar widget preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NutritionCalendarSettings {
    #[serde(default)]
    pub week_start: WeekStart,
    #[serde(default = "default_true")]
    pub show_wet_food: bool,
    #[serde(default = "default_true")]
    pub show_liquids: bool,
    #[serde(default = "default_true")]
    pub show_water: bool,
    #[serde(default = "default_true")]
    pub show_dry_food: bool,
    #[serde(default = "default_true")]
    pub show_record_count: bool,
    #[serde(default = "default_true")]
    pub show_total_fluid: bool,
}

impl Default for NutritionCalendarSettings {
    fn default() -> Self {
        NutritionCalendarSettings {
            week_start: WeekStart::default(),
            show_wet_food: true,
            show_liquids: true,
            show_water: true,
            show_dry_food: true,
            show_record_count: true,
            show_total_fluid: true,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateNutritionCalendarSettings {
    pub week_start: Option<WeekStart>,
    pub show_wet_food: Option<bool>,
    pub show_liquids: Option<bool>,
    pub show_water: Option<bool>,
    pub show_dry_food: Option<bool>,
    pub show_record_count: Option<bool>,
    pub show_total_fluid: Option<bool>,
}

impl UpdateNutritionCalendarSettings {
    pub fn apply(self, existing: NutritionCalendarSettings) -> NutritionCalendarSettings {
        NutritionCalendarSettings {
            week_start: self.week_start.unwrap_or(existing.week_start),
            show_wet_food: self.show_wet_food.unwrap_or(existing.show_wet_food),
            show_liquids: self.show_liquids.unwrap_or(existing.show_liquids),
            show_water: self.show_water.unwrap_or(existing.show_water),
            show_dry_food: self.show_dry_food.unwrap_or(existing.show_dry_food),
            show_record_count: self.show_record_count.unwrap_or(existing.show_record_count),
            show_total_fluid: self.show_total_fluid.unwrap_or(existing.show_total_fluid),
        }
    }
}

/// Per-user cumulative fluid chart widget preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CumulativeFluidChartSettings {
    #[serde(default = "default_true")]
    pub show_current_liquids: bool,
    #[serde(default = "default_false")]
    pub show_current_food_fluid: bool,
    #[serde(default = "default_false")]
    pub show_current_total: bool,
    #[serde(default = "default_true")]
    pub show_best_day_liquids: bool,
    #[serde(default = "default_false")]
    pub show_best_day_food_fluid: bool,
    #[serde(default = "default_false")]
    pub show_best_day_total: bool,
    #[serde(default = "default_true")]
    pub show_schedule: bool,
    #[serde(default = "default_true")]
    pub show_now_bar: bool,
}

impl Default for CumulativeFluidChartSettings {
    fn default() -> Self {
        CumulativeFluidChartSettings {
            show_current_liquids: true,
            show_current_food_fluid: false,
            show_current_total: false,
            show_best_day_liquids: true,
            show_best_day_food_fluid: false,
            show_best_day_total: false,
            show_schedule: true,
            show_now_bar: true,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateCumulativeFluidChartSettings {
    pub show_current_liquids: Option<bool>,
    pub show_current_food_fluid: Option<bool>,
    pub show_current_total: Option<bool>,
    pub show_best_day_liquids: Option<bool>,
    pub show_best_day_food_fluid: Option<bool>,
    pub show_best_day_total: Option<bool>,
    pub show_schedule: Option<bool>,
    pub show_now_bar: Option<bool>,
}

impl UpdateCumulativeFluidChartSettings {
    pub fn apply(self, existing: CumulativeFluidChartSettings) -> CumulativeFluidChartSettings {
        CumulativeFluidChartSettings {
            show_current_liquids: self
                .show_current_liquids
                .unwrap_or(existing.show_current_liquids),
            show_current_food_fluid: self
                .show_current_food_fluid
                .unwrap_or(existing.show_current_food_fluid),
            show_current_total: self
                .show_current_total
                .unwrap_or(existing.show_current_total),
            show_best_day_liquids: self
                .show_best_day_liquids
                .unwrap_or(existing.show_best_day_liquids),
            show_best_day_food_fluid: self
                .show_best_day_food_fluid
                .unwrap_or(existing.show_best_day_food_fluid),
            show_best_day_total: self
                .show_best_day_total
                .unwrap_or(existing.show_best_day_total),
            show_schedule: self.show_schedule.unwrap_or(existing.show_schedule),
            show_now_bar: self.show_now_bar.unwrap_or(existing.show_now_bar),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

/// Per-user developer tooling (curl snippets, etc.).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DeveloperModeSettings {
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDeveloperModeSettings {
    pub enabled: Option<bool>,
}

impl UpdateDeveloperModeSettings {
    pub fn apply(self, existing: DeveloperModeSettings) -> DeveloperModeSettings {
        DeveloperModeSettings {
            enabled: self.enabled.unwrap_or(existing.enabled),
        }
    }
}

pub fn is_known_user_settings_key(key: &str) -> bool {
    matches!(
        key,
        DISPLAY_KEY | NUTRITION_CALENDAR_KEY | CUMULATIVE_FLUID_CHART_KEY | DEVELOPER_MODE_KEY
    )
}
