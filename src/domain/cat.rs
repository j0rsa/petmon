use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Cat {
    pub id: String,
    pub name: String,
    pub status: String,
    pub weight_kg: Option<f64>,
    pub feeding_notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCat {
    pub name: String,
    pub status: Option<String>,
    pub weight_kg: Option<f64>,
    pub feeding_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCat {
    pub name: Option<String>,
    pub status: Option<String>,
    pub weight_kg: Option<f64>,
    pub feeding_notes: Option<String>,
}

impl Cat {
    pub fn new(req: CreateCat) -> Self {
        let now = Utc::now().to_rfc3339();
        Cat {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            status: req.status.unwrap_or_else(|| "active".to_string()),
            weight_kg: req.weight_kg,
            feeding_notes: req.feeding_notes,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
