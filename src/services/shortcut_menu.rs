use serde::Serialize;
use uuid::Uuid;

use crate::domain::medication::{DailyMedAssignment, MedType, DOSE_FRACTIONS};
use crate::error::AppResult;
use crate::services::medication_service;
use sqlx::SqlitePool;

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
    pub medication_id: String,
    pub assignment_id: String,
    pub kind: MenuChoiceKind,
    /// Canonical fraction names (`three_quarter`), for API clients.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fractions: Option<Vec<&'static str>>,
    /// Display forms of `fractions`, same order (`3/4`). Dose pickers show
    /// and echo these back as `?dose_fraction=`; the take endpoint parses
    /// both display spellings and canonical names.
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
    /// `empty` when nothing is due; branch on this rather than counting `choices`.
    pub status: MenuStatus,
    pub choices: Vec<MedIntakeMenuChoice>,
    /// Human-readable labels in the same order as `choices`. Guaranteed unique.
    pub labels: Vec<String>,
    /// Pipe-encoded lines: `label|assignment_id|kind[|fractions_csv]`.
    pub lines: Vec<String>,
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
    assignment_id: &str,
    kind: MenuChoiceKind,
    fractions_csv: Option<&str>,
) -> String {
    match fractions_csv {
        Some(csv) => format!("{label}|{assignment_id}|{}|{csv}", kind.as_line_str()),
        None => format!("{label}|{assignment_id}|{}", kind.as_line_str()),
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
/// The Shortcuts flow carries a picked label out of the multi-select and finds
/// its choice by string equality, so two identical labels would log both doses
/// on a single tap.
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
    let taken_today =
        crate::repo::med_intake_records::taken_counts_on(pool, pet_id, date).await?;

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
        let kind = choice_kind(&item);
        let is_pill_choice = kind == MenuChoiceKind::OptionalPill;
        choices.push(MedIntakeMenuChoice {
            label,
            medication_id: item.medication.id.clone(),
            assignment_id: item.assignment.id.clone(),
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
            let fractions_csv = choice
                .fraction_labels
                .as_ref()
                .map(|values| values.join(","));
            encode_line(
                &choice.label,
                &choice.assignment_id,
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
    fn encode_line_includes_kind_and_fractions() {
        let line = encode_line(
            "Gabapentin · As needed",
            "assign-abc",
            MenuChoiceKind::OptionalPill,
            Some("1,1/2"),
        );
        assert_eq!(line, "Gabapentin · As needed|assign-abc|optional_pill|1,1/2");
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
            medication_id: "med-1".into(),
            assignment_id: "assign-1".into(),
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
