use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct NutritionRecord {
    pub id: String,
    pub pet_id: Uuid,
    pub occurred_at: String,
    pub local_date: String,
    pub category: String,
    pub amount: f64,
    pub unit: Option<String>,
    pub note: Option<String>,
    pub source_type: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateNutritionRecord {
    pub pet_id: Uuid,
    pub occurred_at: String,
    pub local_date: Option<String>,
    pub category: String,
    pub amount: f64,
    pub unit: Option<String>,
    pub note: Option<String>,
    pub source_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchCreateNutritionRecords {
    pub records: Vec<CreateNutritionRecord>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNutritionRecord {
    pub occurred_at: Option<String>,
    pub local_date: Option<String>,
    pub category: Option<String>,
    pub amount: Option<f64>,
    pub unit: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NutritionRecordFilters {
    pub pet_id: Option<Uuid>,
    pub date: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub category: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum NutritionCategory {
    WetFood,
    DryFood,
    Water,
    Treats,
    Medication,
    Custom,
}

impl std::fmt::Display for NutritionCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NutritionCategory::WetFood => write!(f, "wet_food"),
            NutritionCategory::DryFood => write!(f, "dry_food"),
            NutritionCategory::Water => write!(f, "water"),
            NutritionCategory::Treats => write!(f, "treats"),
            NutritionCategory::Medication => write!(f, "medication"),
            NutritionCategory::Custom => write!(f, "custom"),
        }
    }
}

impl NutritionRecord {
    pub fn new(req: CreateNutritionRecord) -> Self {
        let now = Utc::now().to_rfc3339();
        let local_date = req
            .local_date
            .unwrap_or_else(|| req.occurred_at.split('T').next().unwrap_or("").to_string());
        NutritionRecord {
            id: Uuid::new_v4().to_string(),
            pet_id: req.pet_id,
            occurred_at: req.occurred_at,
            local_date,
            category: req.category,
            amount: req.amount,
            unit: req.unit,
            note: req.note,
            source_type: req.source_type.unwrap_or_else(|| "manual".to_string()),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
