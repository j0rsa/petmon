use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use super::nutrition_record::NutritionRecord;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct NutritionDailyTotal {
    pub local_date: String,
    pub pet_id: Uuid,
    pub category: String,
    pub total_amount: f64,
    pub record_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NutritionDaySummary {
    pub local_date: String,
    pub pet_id: Option<Uuid>,
    pub records: Vec<NutritionRecord>,
    pub totals_by_category: HashMap<String, f64>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NutritionAnalyticsQuery {
    pub pet_id: Option<Uuid>,
    pub date_from: String,
    pub date_to: String,
    pub category: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NutritionRangeSummary {
    pub date_from: String,
    pub date_to: String,
    pub pet_id: Option<Uuid>,
    pub daily_totals: Vec<NutritionDailyTotal>,
    pub category_averages: HashMap<String, f64>,
}
