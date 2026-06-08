use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct DailyTotal {
    pub local_date: String,
    pub cat_id: String,
    pub category: String,
    pub total_amount: f64,
    pub entry_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DaySummary {
    pub local_date: String,
    pub cat_id: Option<String>,
    pub entries: Vec<crate::domain::entry::Entry>,
    pub totals_by_category: HashMap<String, f64>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnalyticsQuery {
    pub cat_id: Option<String>,
    pub date_from: String,
    pub date_to: String,
    pub category: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RangeSummary {
    pub date_from: String,
    pub date_to: String,
    pub cat_id: Option<String>,
    pub daily_totals: Vec<DailyTotal>,
    pub category_averages: HashMap<String, f64>,
}

#[derive(Debug, Serialize)]
pub struct ScheduleAdherence {
    pub local_date: String,
    pub cat_id: String,
    pub schedule_id: String,
    pub schedule_name: String,
    pub expected_categories: Vec<String>,
    pub actual_totals: HashMap<String, f64>,
    pub adherence_score: f64,
}
