use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct NutritionRecord {
    pub id: String,
    pub pet_id: Uuid,
    pub occurred_at: String,
    pub local_date: String,
    pub category: NutritionCategory,
    pub amount: f64,
    pub unit: Option<String>,
    pub source_type: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateNutritionRecord {
    pub pet_id: Uuid,
    /// RFC3339 timestamp. Omit to use the server's current time.
    pub occurred_at: Option<String>,
    pub local_date: Option<String>,
    pub category: NutritionCategory,
    pub amount: f64,
    pub unit: Option<String>,
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
    pub category: Option<NutritionCategory>,
    pub amount: Option<f64>,
    pub unit: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NutritionRecordFilters {
    pub pet_id: Option<Uuid>,
    pub date: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub category: Option<NutritionCategory>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum NutritionCategory {
    WetFood,
    DryFood,
    Water,
    Liquids,
}

impl std::fmt::Display for NutritionCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NutritionCategory::WetFood => write!(f, "wet_food"),
            NutritionCategory::DryFood => write!(f, "dry_food"),
            NutritionCategory::Water => write!(f, "water"),
            NutritionCategory::Liquids => write!(f, "liquids"),
        }
    }
}

impl std::str::FromStr for NutritionCategory {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "wet_food" => Ok(Self::WetFood),
            "dry_food" => Ok(Self::DryFood),
            "water" => Ok(Self::Water),
            "liquids" => Ok(Self::Liquids),
            _ => Err(()),
        }
    }
}

impl NutritionRecord {
    pub fn new(req: CreateNutritionRecord) -> Self {
        let now = Utc::now().to_rfc3339();
        let occurred_at = req.occurred_at.unwrap_or_else(|| now.clone());
        let local_date = req
            .local_date
            .unwrap_or_else(|| occurred_at.split('T').next().unwrap_or("").to_string());
        NutritionRecord {
            id: Uuid::new_v4().to_string(),
            pet_id: req.pet_id,
            occurred_at,
            local_date,
            category: req.category,
            amount: req.amount,
            unit: req.unit,
            source_type: req.source_type.unwrap_or_else(|| "manual".to_string()),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
