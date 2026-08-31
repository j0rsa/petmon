use serde::{Deserialize, Serialize};

pub const MED_NUDGE_KEY: &str = "med_nudge";

/// A single time-of-day nudge slot. Uses an hour (0–23) to keep the scheduler
/// to at most 24 distinct cron buckets per day.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NudgeSlot {
    #[serde(default)]
    pub enabled: bool,
    /// Hour of day (0–23) by which the dose should have been logged.
    #[serde(default)]
    pub deadline_hour: u8,
}

/// Per-pet daily nudge schedule. Stored in `pet_settings` and shared by all
/// owners of a pet.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PetNudgeSchedule {
    #[serde(default)]
    pub morning: NudgeSlot,
    #[serde(default)]
    pub midday: NudgeSlot,
    #[serde(default)]
    pub evening: NudgeSlot,
}

pub fn is_known_pet_settings_key(key: &str) -> bool {
    matches!(key, MED_NUDGE_KEY)
}
