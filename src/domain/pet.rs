use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::pet_status::PetStatus;
use super::species::PetSpecies;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Pet {
    pub id: Uuid,
    pub name: String,
    pub species: PetSpecies,
    pub status: PetStatus,
    pub breed: Option<String>,
    pub birth_date: Option<String>,
    pub blood_type: Option<String>,
    pub color: Option<String>,
    // Kept in DB as a cached snapshot updated by weight_records::create.
    // Not exposed in the API — use /health/weight for current/historical weight.
    #[serde(skip_serializing)]
    pub weight_kg: Option<f64>,
    pub feeding_notes: Option<String>,
    pub telegram_chat_id: Option<String>,
    pub telegram_thread_id: Option<String>,
    /// When true, general elimination records with duration are auto-tagged as wee/poop
    /// based on historical duration buckets for this pet.
    #[serde(default)]
    pub elimination_auto_categorize_by_duration: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePet {
    pub name: String,
    #[serde(default)]
    pub species: PetSpecies,
    #[serde(default)]
    pub status: PetStatus,
    pub breed: Option<String>,
    pub birth_date: Option<String>,
    pub blood_type: Option<String>,
    pub color: Option<String>,
    pub feeding_notes: Option<String>,
    pub telegram_chat_id: Option<String>,
    pub telegram_thread_id: Option<String>,
    #[serde(default)]
    pub elimination_auto_categorize_by_duration: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePet {
    pub name: Option<String>,
    pub species: Option<PetSpecies>,
    pub status: Option<PetStatus>,
    pub breed: Option<String>,
    pub birth_date: Option<String>,
    pub blood_type: Option<String>,
    pub color: Option<String>,
    pub feeding_notes: Option<String>,
    pub telegram_chat_id: Option<String>,
    pub telegram_thread_id: Option<String>,
    pub elimination_auto_categorize_by_duration: Option<bool>,
}

impl Pet {
    pub fn new(req: CreatePet) -> Self {
        let now = Utc::now().to_rfc3339();
        Pet {
            id: Uuid::new_v4(),
            name: req.name,
            species: req.species,
            status: req.status,
            breed: req.breed,
            birth_date: req.birth_date,
            blood_type: req.blood_type,
            color: req.color,
            weight_kg: None,
            feeding_notes: req.feeding_notes,
            telegram_chat_id: req.telegram_chat_id,
            telegram_thread_id: req.telegram_thread_id,
            elimination_auto_categorize_by_duration: req.elimination_auto_categorize_by_duration,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
