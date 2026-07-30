use crate::domain::weight::WeightRecord;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum EliminationEventType {
    General,
    Urination,
    Defecation,
    Vomit,
}

impl std::fmt::Display for EliminationEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EliminationEventType::General => write!(f, "general"),
            EliminationEventType::Urination => write!(f, "urination"),
            EliminationEventType::Defecation => write!(f, "defecation"),
            EliminationEventType::Vomit => write!(f, "vomit"),
        }
    }
}

impl std::str::FromStr for EliminationEventType {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "general" => Ok(Self::General),
            "urination" => Ok(Self::Urination),
            "defecation" => Ok(Self::Defecation),
            "vomit" => Ok(Self::Vomit),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EliminationRecord {
    pub id: String,
    pub pet_id: Uuid,
    pub occurred_at: String,
    pub local_date: String,
    pub event_type: EliminationEventType,
    pub subtype: Option<String>,
    pub duration_seconds: Option<i64>,
    pub note: Option<String>,
    pub source_type: String,
    pub is_auto_categorized: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEliminationRecord {
    pub pet_id: String,
    /// Naive local datetime YYYY-MM-DDTHH:MM:SS. Defaults to now in configured timezone.
    pub occurred_at: Option<String>,
    pub local_date: Option<String>,
    pub event_type: EliminationEventType,
    pub subtype: Option<String>,
    pub duration_seconds: Option<i64>,
    pub note: Option<String>,
    pub source_type: Option<String>,
}

/// Submit a toileting event and a weight measurement in a single request.
/// Both records share the same resolved timestamp.
#[derive(Debug, Deserialize)]
pub struct CreateEliminationWithWeight {
    pub pet_id: String,
    /// Naive local datetime YYYY-MM-DDTHH:MM:SS. Defaults to now in configured timezone.
    /// Applied to both the elimination record and the weight record.
    pub occurred_at: Option<String>,
    pub local_date: Option<String>,
    /// Defaults to General when omitted.
    pub event_type: Option<EliminationEventType>,
    pub subtype: Option<String>,
    pub duration_seconds: Option<i64>,
    pub note: Option<String>,
    pub source_type: Option<String>,
    pub weight_kg: f64,
    pub weight_note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EliminationWithWeightCreated {
    pub elimination: EliminationRecord,
    pub weight: WeightRecord,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEliminationRecord {
    pub occurred_at: Option<String>,
    pub local_date: Option<String>,
    pub event_type: Option<EliminationEventType>,
    /// Use Some(None) to clear the subtype, Some(Some(s)) to set it.
    pub subtype: Option<Option<String>>,
    /// Use Some(None) to clear, Some(Some(n)) to set.
    pub duration_seconds: Option<Option<i64>>,
    /// `None` = key absent (leave unchanged); `Some(None)` = key present as
    /// JSON `null` (clear the note); `Some(Some(s))` = set the note to `s`.
    #[serde(default, deserialize_with = "crate::domain::double_option")]
    pub note: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
pub struct EliminationRecordFilters {
    pub pet_id: Option<String>,
    pub date: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub event_type: Option<EliminationEventType>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EliminationDailySummary {
    pub local_date: String,
    pub pet_id: Option<String>,
    pub total_count: i64,
    pub urination_count: i64,
    pub defecation_count: i64,
    pub vomit_count: i64,
    pub general_count: i64,
    pub has_vomit: bool,
    /// Average duration in seconds for urination records with duration logged.
    pub urination_avg_duration_seconds: Option<f64>,
    /// Average duration in seconds for defecation records with duration logged.
    pub defecation_avg_duration_seconds: Option<f64>,
    /// Average duration in seconds for general records with duration logged.
    pub general_avg_duration_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EliminationDurationBucket {
    pub sample_count: i64,
    pub avg_duration_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EliminationDurationProfile {
    pub pet_id: String,
    pub wee: Option<EliminationDurationBucket>,
    pub poo: Option<EliminationDurationBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EliminationRangeSummary {
    pub date_from: String,
    pub date_to: String,
    pub pet_id: Option<String>,
    pub daily_summaries: Vec<EliminationDailySummary>,
    pub type_totals: HashMap<String, i64>,
    pub avg_per_day: f64,
    pub p50_per_day: f64,
    pub p90_per_day: f64,
    pub p99_per_day: f64,
}
