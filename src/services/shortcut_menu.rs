use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::medication::DailyMedAssignment;
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

const TOKEN_TTL: Duration = Duration::hours(24);

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

/// Pipe-delimited choices for Apple Shortcuts: `label|take_token`.
/// Excludes optional meds and bundle members.
pub async fn med_intake_menu_choices(
    pool: &SqlitePool,
    pet_id: Uuid,
    date: &str,
) -> AppResult<Vec<String>> {
    let daily = medication_service::daily_assignments(pool, pet_id, date).await?;
    let bundled = bundled_medication_ids(pool, pet_id).await?;

    let mut choices = Vec::new();
    for item in daily {
        if item.assignment.optional {
            continue;
        }
        if bundled.contains(&item.medication.id) {
            continue;
        }
        let token = encode_take_token(pet_id, &item.medication.id, &item.assignment.id)?;
        choices.push(format!("{}|{}", menu_label(&item), token));
    }
    choices.sort();
    Ok(choices)
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
}
