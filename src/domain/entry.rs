use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Entry {
    pub id: String,
    pub cat_id: String,
    pub occurred_at: String,
    pub local_date: String,
    pub category: String,
    pub amount: f64,
    pub unit: Option<String>,
    pub note: Option<String>,
    pub source_type: String,
    pub import_batch_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateEntry {
    pub cat_id: String,
    pub occurred_at: String,
    pub local_date: Option<String>,
    pub category: String,
    pub amount: f64,
    pub unit: Option<String>,
    pub note: Option<String>,
    pub source_type: Option<String>,
    pub import_batch_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEntry {
    pub occurred_at: Option<String>,
    pub local_date: Option<String>,
    pub category: Option<String>,
    pub amount: Option<f64>,
    pub unit: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EntryFilters {
    pub cat_id: Option<String>,
    pub date: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub category: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    WetFood,
    DryFood,
    Water,
    Treats,
    Medication,
    Custom,
}

impl std::fmt::Display for Category {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Category::WetFood => write!(f, "wet_food"),
            Category::DryFood => write!(f, "dry_food"),
            Category::Water => write!(f, "water"),
            Category::Treats => write!(f, "treats"),
            Category::Medication => write!(f, "medication"),
            Category::Custom => write!(f, "custom"),
        }
    }
}

impl Entry {
    pub fn new(req: CreateEntry) -> Self {
        let now = Utc::now().to_rfc3339();
        let local_date = req
            .local_date
            .unwrap_or_else(|| req.occurred_at.split('T').next().unwrap_or("").to_string());
        Entry {
            id: Uuid::new_v4().to_string(),
            cat_id: req.cat_id,
            occurred_at: req.occurred_at,
            local_date,
            category: req.category,
            amount: req.amount,
            unit: req.unit,
            note: req.note,
            source_type: req.source_type.unwrap_or_else(|| "manual".to_string()),
            import_batch_id: req.import_batch_id,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
