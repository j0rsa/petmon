use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const RECORD_TYPE: &str = "overall_state";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthStateLevel {
    Terrible,
    Poor,
    Ok,
    Good,
    Amazing,
}

impl HealthStateLevel {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "terrible" => Some(Self::Terrible),
            "poor" => Some(Self::Poor),
            "ok" => Some(Self::Ok),
            "good" => Some(Self::Good),
            "amazing" => Some(Self::Amazing),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Terrible => "terrible",
            Self::Poor => "poor",
            Self::Ok => "ok",
            Self::Good => "good",
            Self::Amazing => "amazing",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatePayload {
    pub level: HealthStateLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStateRecord {
    pub id: String,
    pub pet_id: Uuid,
    pub occurred_at: String,
    pub local_date: String,
    pub level: HealthStateLevel,
    pub note: Option<String>,
    pub source_type: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateHealthStateRecord {
    pub pet_id: String,
    pub level: HealthStateLevel,
    pub occurred_at: Option<String>,
    pub local_date: Option<String>,
    pub note: Option<String>,
    pub source_type: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct HealthStateRecordFilters {
    pub pet_id: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
