use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, Default)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum PetSpecies {
    Cat,
    Dog,
    Bunny,
    Parrot,
    #[default]
    Other,
}

impl PetSpecies {
    pub const ALL: [PetSpecies; 5] = [
        PetSpecies::Cat,
        PetSpecies::Dog,
        PetSpecies::Bunny,
        PetSpecies::Parrot,
        PetSpecies::Other,
    ];
}
