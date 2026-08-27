use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::medication::{DailyMedAssignment, MedType, DOSE_FRACTIONS};
use crate::error::{AppError, AppResult};
use crate::services::medication_service;
use sqlx::SqlitePool;

/// What a take token carries.
///
/// The token is base64url JSON, not a signed or encrypted blob: anyone can read
/// it and anyone can mint one. It is a *convenience* handle, not an
/// authorization — every take still requires an `api_write` bearer token, and
/// `repo::med_intake_records::create` re-validates that the medication belongs
/// to the pet, that the assignment belongs to the medication, and that the
/// assignment is active and due. Do not put anything private in here.
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
    /// Canonical fraction names (`three_quarter`), for API clients.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fractions: Option<Vec<&'static str>>,
    /// Display forms of `fractions`, same order (`3/4`). This is what the
    /// Shortcuts / AutoMate dose pickers show and send back as
    /// `?dose_fraction=`; the take endpoint parses both spellings.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fraction_labels: Option<Vec<&'static str>>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MenuStatus {
    Ok,
    Empty,
}

#[derive(Debug, Serialize)]
pub struct MedIntakeMenuResponse {
    /// `empty` when nothing is due. Shortcuts and AutoMate cannot count a list
    /// portably, so they branch on this string instead of on `labels.count`.
    pub status: MenuStatus,
    pub choices: Vec<MedIntakeMenuChoice>,
    /// Human-readable labels for Shortcuts / Automate pickers (same order as `lines`).
    /// Guaranteed unique — the pickers match a selection back to a line by label.
    pub labels: Vec<String>,
    /// Pipe-encoded lines for Apple Shortcuts: `label|token|kind[|fractions_csv]`.
    pub lines: Vec<String>,
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
    DOSE_FRACTIONS.iter().map(|f| f.as_str()).collect()
}

fn pill_fraction_labels() -> Vec<&'static str> {
    DOSE_FRACTIONS.iter().map(|f| f.display_str()).collect()
}

/// Make every label unique by suffixing ` (2)`, ` (3)`, …
///
/// The Shortcuts and AutoMate flows carry a *label* out of the picker and look
/// the line up by string equality, so two identical labels would log both doses
/// on a single tap. Two courses of the same medication with the same dose (one
/// scheduled, one optional) are enough to collide.
fn disambiguate_labels(choices: &mut [MedIntakeMenuChoice]) {
    let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();
    for choice in choices.iter_mut() {
        if used.contains(&choice.label) {
            let base = choice.label.clone();
            let mut suffix = 2;
            loop {
                let candidate = format!("{base} ({suffix})");
                if !used.contains(&candidate) {
                    choice.label = candidate;
                    break;
                }
                suffix += 1;
            }
        }
        used.insert(choice.label.clone());
    }
}

/// Menu for Apple Shortcuts. Includes scheduled and optional meds; excludes bundle members.
pub async fn med_intake_menu(
    pool: &SqlitePool,
    pet_id: Uuid,
    date: &str,
) -> AppResult<MedIntakeMenuResponse> {
    let daily = medication_service::daily_assignments(pool, pet_id, date).await?;
    let bundled = bundled_medication_ids(pool, pet_id).await?;
    let taken_today = crate::repo::med_intake_records::taken_counts_on(pool, pet_id, date).await?;

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
        if !item.assignment.optional {
            let taken = taken_today.get(&item.assignment.id).copied().unwrap_or(0);
            if taken >= item.assignment.frequency.expected_doses() {
                continue;
            }
        }

        let label = menu_label(&item);
        let token = encode_take_token(pet_id, &item.medication.id, &item.assignment.id)?;
        let kind = choice_kind(&item);
        let is_pill_choice = kind == MenuChoiceKind::OptionalPill;
        choices.push(MedIntakeMenuChoice {
            label,
            token,
            kind,
            fractions: is_pill_choice.then(pill_fractions),
            fraction_labels: is_pill_choice.then(pill_fraction_labels),
        });
    }

    choices.sort_by(|a, b| a.label.cmp(&b.label));
    disambiguate_labels(&mut choices);
    let labels = choices.iter().map(|choice| choice.label.clone()).collect();
    let lines = choices
        .iter()
        .map(|choice| {
            // The pickers show and return the display forms, so that is what the
            // line carries.
            let fractions_csv = choice
                .fraction_labels
                .as_ref()
                .map(|values| values.join(","));
            encode_line(
                &choice.label,
                &choice.token,
                choice.kind,
                fractions_csv.as_deref(),
            )
        })
        .collect();

    let status = if choices.is_empty() {
        MenuStatus::Empty
    } else {
        MenuStatus::Ok
    };

    Ok(MedIntakeMenuResponse {
        status,
        choices,
        labels,
        lines,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::medication::DoseFraction;

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
            Some("1,1/2"),
        );
        assert_eq!(line, "Gabapentin · As needed|tok123|optional_pill|1,1/2");
    }

    #[test]
    fn pill_fraction_labels_round_trip_through_parse() {
        for (name, label) in pill_fractions().iter().zip(pill_fraction_labels()) {
            let by_name = DoseFraction::parse(name).expect("canonical name parses");
            let by_label = DoseFraction::parse(label).expect("display label parses");
            assert_eq!(by_name, by_label, "{name} vs {label}");
            assert_eq!(by_name.display_str(), label);
        }
    }

    fn choice(label: &str) -> MedIntakeMenuChoice {
        MedIntakeMenuChoice {
            label: label.to_string(),
            token: "tok".into(),
            kind: MenuChoiceKind::Scheduled,
            fractions: None,
            fraction_labels: None,
        }
    }

    #[test]
    fn duplicate_labels_are_suffixed() {
        let mut choices = vec![choice("Vetmedin · 1 tab"), choice("Vetmedin · 1 tab")];
        disambiguate_labels(&mut choices);
        assert_eq!(choices[0].label, "Vetmedin · 1 tab");
        assert_eq!(choices[1].label, "Vetmedin · 1 tab (2)");
    }

    #[test]
    fn suffixing_skips_a_label_that_already_looks_suffixed() {
        let mut choices = vec![
            choice("Vetmedin · 1 tab"),
            choice("Vetmedin · 1 tab (2)"),
            choice("Vetmedin · 1 tab"),
        ];
        disambiguate_labels(&mut choices);
        let labels: Vec<&str> = choices.iter().map(|c| c.label.as_str()).collect();
        assert_eq!(
            labels,
            [
                "Vetmedin · 1 tab",
                "Vetmedin · 1 tab (2)",
                "Vetmedin · 1 tab (3)"
            ]
        );
    }
}
