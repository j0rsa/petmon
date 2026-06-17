use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, Default)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum PetStatus {
    #[default]
    Active,
    Archived,
}

impl PetStatus {
    pub const ALL: [PetStatus; 2] = [PetStatus::Active, PetStatus::Archived];
}
