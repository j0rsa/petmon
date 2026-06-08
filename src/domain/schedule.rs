use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Schedule {
    pub id: String,
    pub cat_id: String,
    pub name: String,
    pub active: bool,
    pub rules_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSchedule {
    pub cat_id: String,
    pub name: String,
    pub active: Option<bool>,
    pub rules: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSchedule {
    pub name: Option<String>,
    pub active: Option<bool>,
    pub rules: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScheduleRule {
    pub category: String,
    pub target_amount: f64,
    pub unit: Option<String>,
    pub time_of_day: Option<String>,
    pub notes: Option<String>,
}

impl Schedule {
    pub fn new(req: CreateSchedule) -> Self {
        let now = Utc::now().to_rfc3339();
        Schedule {
            id: Uuid::new_v4().to_string(),
            cat_id: req.cat_id,
            name: req.name,
            active: req.active.unwrap_or(true),
            rules_json: req.rules.map(|r| r.to_string()).unwrap_or_else(|| "[]".to_string()),
            created_at: now.clone(),
            updated_at: now,
        }
    }

    pub fn rules(&self) -> Vec<ScheduleRule> {
        serde_json::from_str(&self.rules_json).unwrap_or_default()
    }
}
