use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::medication::{DailyMedAssignment, DoseFraction, MedType};
use crate::error::{AppError, AppResult};
use crate::services::medication_service;
use sqlx::SqlitePool;

#[derive(Debug, Serialize, Deserialize)]
pub struct TakeTokenPayload {
    pub pet_id: String,
    pub medication_id: String,
    pub assignment_id: String,
    exp: i64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MenuChoiceKind {
    Scheduled,
    OptionalPill,
    OptionalLiquid,
}

impl MenuChoiceKind {
    fn as_line_str(self) -> &'static str {
        match self {
            Self::Scheduled => "scheduled",
            Self::OptionalPill => "optional_pill",
            Self::OptionalLiquid => "optional_liquid",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MedIntakeMenuChoice {
    pub label: String,
    pub token: String,
    pub kind: MenuChoiceKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fractions: Option<Vec<&'static str>>,
}

#[derive(Debug, Serialize)]
pub struct MedIntakeMenuResponse {
    pub choices: Vec<MedIntakeMenuChoice>,
    /// Pipe-encoded lines for Apple Shortcuts: `label|token|kind|fractions_csv`.
    pub lines: Vec<String>,
}

const TOKEN_TTL: Duration = Duration::hours(24);

const ALL_DOSE_FRACTIONS: [DoseFraction; 7] = [
    DoseFraction::Whole,
    DoseFraction::ThreeQuarter,
    DoseFraction::Half,
    DoseFraction::Third,
    DoseFraction::Quarter,
    DoseFraction::Eighth,
    DoseFraction::Sixteenth,
];

fn encode_take_token(pet_id: Uuid, medication_id: &str, assignment_id: &str) -> AppResult<String> {
    let payload = TakeTokenPayload {
        pet_id: pet_id.to_string(),
        medication_id: medication_id.to_string(),
        assignment_id: assignment_id.to_string(),
        exp: (Utc::now() + TOKEN_TTL).timestamp(),
    };
    let json = serde_json::to_vec(&payload).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(URL_SAFE_NO_PAD.encode(json))
}

pub fn decode_take_token(token: &str) -> AppResult<TakeTokenPayload> {
    let bytes = URL_SAFE_NO_PAD
        .decode(token)
        .map_err(|_| AppError::BadRequest("invalid take token".into()))?;
    let payload: TakeTokenPayload = serde_json::from_slice(&bytes)
        .map_err(|_| AppError::BadRequest("invalid take token payload".into()))?;
    if payload.exp < Utc::now().timestamp() {
        return Err(AppError::BadRequest("take token expired".into()));
    }
    Ok(payload)
}

async fn bundled_medication_ids(
    pool: &SqlitePool,
    pet_id: Uuid,
) -> AppResult<std::collections::HashSet<String>> {
    let bundles = crate::repo::med_bundles::list_by_pet(pool, pet_id).await?;
    Ok(bundles
        .into_iter()
        .flat_map(|bundle| bundle.items.into_iter().map(|item| item.medication_id))
        .collect())
}

fn menu_label(item: &DailyMedAssignment) -> String {
    format!("{} · {}", item.medication.name, item.assignment.dose_label)
}

fn encode_line(
    label: &str,
    token: &str,
    kind: MenuChoiceKind,
    fractions_csv: Option<&str>,
) -> String {
    match fractions_csv {
        Some(csv) => format!("{label}|{token}|{}|{csv}", kind.as_line_str()),
        None => format!("{label}|{token}|{}", kind.as_line_str()),
    }
}

fn choice_kind(item: &DailyMedAssignment) -> MenuChoiceKind {
    if item.assignment.optional {
        match item.medication.med_type {
            MedType::Pill => MenuChoiceKind::OptionalPill,
            MedType::Liquid => MenuChoiceKind::OptionalLiquid,
        }
    } else {
        MenuChoiceKind::Scheduled
    }
}

fn pill_fractions() -> Vec<&'static str> {
    ALL_DOSE_FRACTIONS.iter().map(|f| f.as_str()).collect()
}

/// Menu for Apple Shortcuts. Includes scheduled and optional meds; excludes bundle members.
pub async fn med_intake_menu(
    pool: &SqlitePool,
    pet_id: Uuid,
    date: &str,
) -> AppResult<MedIntakeMenuResponse> {
    let daily = medication_service::daily_assignments(pool, pet_id, date).await?;
    let bundled = bundled_medication_ids(pool, pet_id).await?;

    let mut choices = Vec::new();
    for item in daily {
        if bundled.contains(&item.medication.id) {
            continue;
        }
        if !item.assignment.optional
            && !crate::domain::medication::assignment_due_on(&item.assignment, date)
        {
            continue;
        }

        let label = menu_label(&item);
        let token = encode_take_token(pet_id, &item.medication.id, &item.assignment.id)?;
        let kind = choice_kind(&item);
        let fractions = if kind == MenuChoiceKind::OptionalPill {
            Some(pill_fractions())
        } else {
            None
        };
        choices.push(MedIntakeMenuChoice {
            label,
            token,
            kind,
            fractions,
        });
    }

    choices.sort_by(|a, b| a.label.cmp(&b.label));
    let lines = choices
        .iter()
        .map(|choice| {
            let fractions_csv = choice.fractions.as_ref().map(|values| values.join(","));
            encode_line(
                &choice.label,
                &choice.token,
                choice.kind,
                fractions_csv.as_deref(),
            )
        })
        .collect();

    Ok(MedIntakeMenuResponse { choices, lines })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_token_roundtrip_and_expiry() {
        let pet_id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let token = encode_take_token(pet_id, "med-1", "assign-1").unwrap();
        let decoded = decode_take_token(&token).unwrap();
        assert_eq!(decoded.pet_id, pet_id.to_string());
        assert_eq!(decoded.medication_id, "med-1");
        assert_eq!(decoded.assignment_id, "assign-1");
    }

    #[test]
    fn encode_line_includes_kind_and_fractions() {
        let line = encode_line(
            "Gabapentin · As needed",
            "tok123",
            MenuChoiceKind::OptionalPill,
            Some("whole,half"),
        );
        assert_eq!(
            line,
            "Gabapentin · As needed|tok123|optional_pill|whole,half"
        );
    }
}
