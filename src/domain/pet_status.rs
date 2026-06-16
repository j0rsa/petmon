use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum PetStatus {
    Active,
    Archived,
}

impl Default for PetStatus {
    fn default() -> Self {
        PetStatus::Active
    }
}

impl PetStatus {
    pub const ALL: [PetStatus; 2] = [PetStatus::Active, PetStatus::Archived];
}
