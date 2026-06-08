use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum PetStatus {
    Alive,
    Deceased,
    Archived,
    Rehomed,
}

impl Default for PetStatus {
    fn default() -> Self {
        PetStatus::Alive
    }
}

impl PetStatus {
    pub const ALL: [PetStatus; 4] = [
        PetStatus::Alive,
        PetStatus::Deceased,
        PetStatus::Archived,
        PetStatus::Rehomed,
    ];
}
