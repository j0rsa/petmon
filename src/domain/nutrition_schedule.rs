use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct NutritionSchedule {
    pub id: String,
    pub pet_id: Uuid,
    pub name: String,
    pub active: bool,
    pub rules_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateNutritionSchedule {
    pub pet_id: Uuid,
    pub name: String,
    pub active: Option<bool>,
    pub rules: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNutritionSchedule {
    pub name: Option<String>,
    pub active: Option<bool>,
    pub rules: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NutritionScheduleRule {
    pub category: String,
    pub target_amount: f64,
    pub unit: Option<String>,
    pub time_of_day: Option<String>,
    pub notes: Option<String>,
}

/// Strip denormalized daily targets from schedule rules. Targets are derived
/// client-side by summing per-window min/max amounts.
pub fn normalize_rules_json(rules: Option<serde_json::Value>) -> String {
    let Some(mut value) = rules else {
        return "[]".to_string();
    };
    strip_stored_targets(&mut value);
    value.to_string()
}

pub fn normalize_rules_json_str(rules_json: &str) -> String {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(rules_json) else {
        return rules_json.to_string();
    };
    strip_stored_targets(&mut value);
    value.to_string()
}

fn strip_stored_targets(value: &mut serde_json::Value) {
    if let serde_json::Value::Object(map) = value {
        map.remove("target_min");
        map.remove("target_max");
        map.remove("target_min_ml");
        map.remove("target_max_ml");
    }
}

impl NutritionSchedule {
    pub fn new(req: CreateNutritionSchedule) -> Self {
        let now = Utc::now().to_rfc3339();
        NutritionSchedule {
            id: Uuid::new_v4().to_string(),
            pet_id: req.pet_id,
            name: req.name,
            active: req.active.unwrap_or(true),
            rules_json: normalize_rules_json(req.rules),
            created_at: now.clone(),
            updated_at: now,
        }
    }

    pub fn with_normalized_rules(mut self) -> Self {
        self.rules_json = normalize_rules_json_str(&self.rules_json);
        self
    }

    pub fn rules(&self) -> Vec<NutritionScheduleRule> {
        serde_json::from_str(&self.rules_json).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalize_rules_json_strips_stored_targets() {
        let raw = json!({
            "type": "liquid",
            "target_min": 79,
            "target_max": 109,
            "target_min_ml": 70,
            "target_max_ml": 120,
            "windows": [{ "from": "08:00", "to": "09:00", "min": 10, "max": 12 }]
        });
        let normalized = normalize_rules_json(Some(raw));
        let parsed: serde_json::Value = serde_json::from_str(&normalized).unwrap();
        assert_eq!(parsed["type"], "liquid");
        assert!(parsed.get("target_min").is_none());
        assert!(parsed.get("target_max").is_none());
        assert!(parsed.get("target_min_ml").is_none());
        assert!(parsed.get("target_max_ml").is_none());
        assert_eq!(parsed["windows"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn normalize_rules_json_leaves_arrays_untouched() {
        let raw = json!([{ "category": "liquids", "target_amount": 10.0 }]);
        let normalized = normalize_rules_json(Some(raw.clone()));
        assert_eq!(normalized, raw.to_string());
    }
}
