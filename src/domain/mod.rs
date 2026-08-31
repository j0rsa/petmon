pub mod analytics;
pub mod elimination;
pub mod elimination_classifier;
pub mod health_state;
pub mod medication;
pub mod notification;
pub mod nutrition_record;
pub mod nutrition_schedule;
pub mod nutrition_status;
pub mod pet;
pub mod pet_settings;
pub mod pet_status;
pub mod pillar;
pub mod push;
pub mod settings;
pub mod species;
pub mod user_settings;
pub mod weight;

/// Deserializer for `Option<Option<T>>` that correctly distinguishes a JSON
/// `null` value (→ `Some(None)`, i.e. "clear the field") from an absent JSON
/// key (→ `None`, i.e. "leave the field unchanged").
///
/// Usage: `#[serde(default, deserialize_with = "double_option")]`
pub fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    serde::Deserialize::deserialize(deserializer).map(Some)
}
