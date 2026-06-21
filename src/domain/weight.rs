use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WeightRecord {
    pub id: String,
    pub pet_id: Uuid,
    pub measured_at: String,
    pub local_date: String,
    pub weight_kg: f64,
    pub note: Option<String>,
    pub source_type: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWeightRecord {
    pub pet_id: String,
    /// Naive local datetime YYYY-MM-DDTHH:MM:SS. Defaults to now in configured timezone.
    pub measured_at: Option<String>,
    pub local_date: Option<String>,
    pub weight_kg: f64,
    pub note: Option<String>,
    pub source_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WeightStats {
    pub latest_kg: Option<f64>,
    pub latest_date: Option<String>,
    pub avg_kg: Option<f64>,
    pub count: i64,
}

#[derive(Debug, Deserialize)]
pub struct WeightRecordFilters {
    pub pet_id: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
