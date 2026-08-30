use serde::Serialize;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::domain::medication::{DailyMedAssignment, MedType, DOSE_FRACTIONS};
use crate::error::AppResult;
use crate::services::medication_service;
use sqlx::SqlitePool;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MenuChoiceKind {
    Bundle,
    Scheduled,
    OptionalPill,
    OptionalLiquid,
}

impl MenuChoiceKind {
    fn as_line_str(self) -> &'static str {
        match self {
            Self::Bundle => "bundle",
            Self::Scheduled => "scheduled",
            Self::OptionalPill => "optional_pill",
            Self::OptionalLiquid => "optional_liquid",
        }
    }

    /// Sort order: bundles first, then scheduled, then optional.
    fn sort_key(self) -> u8 {
        match self {
            Self::Bundle => 0,
            Self::Scheduled => 1,
            Self::OptionalPill | Self::OptionalLiquid => 2,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MedIntakeMenuChoice {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub medication_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignment_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    pub kind: MenuChoiceKind,
    /// Canonical fraction names (`three_quarter`), for API clients.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fractions: Option<Vec<&'static str>>,
    /// Display forms of `fractions`, same order (`3/4`). Dose pickers show
    /// and echo these back as `?dose_fraction=`; the take endpoint parses
    /// both display spellings and canonical names.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fraction_labels: Option<Vec<&'static str>>,
    /// Minutes to wait before feeding after taking this medication.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meal_wait_minutes: Option<i32>,
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

fn menu_label(item: &DailyMedAssignment) -> String {
    format!("{} · {}", item.medication.name, item.assignment.dose_label)
}

fn encode_line(label: &str, id: &str, kind: MenuChoiceKind, fractions_csv: Option<&str>) -> String {
    match fractions_csv {
        Some(csv) => format!("{label}|{id}|{}|{csv}", kind.as_line_str()),
        None => format!("{label}|{id}|{}", kind.as_line_str()),
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

/// Menu for Apple Shortcuts. Bundles appear as single entries; their member
/// meds are excluded from individual choices. Includes scheduled and optional
/// individual meds.
pub async fn med_intake_menu(
    pool: &SqlitePool,
    pet_id: Uuid,
    date: &str,
) -> AppResult<MedIntakeMenuResponse> {
    let daily = medication_service::daily_assignments(pool, pet_id, date).await?;
    let taken_today = crate::repo::med_intake_records::taken_counts_on(pool, pet_id, date).await?;
    let bundles = crate::repo::med_bundles::list_by_pet(pool, pet_id).await?;

    let daily_by_med: HashMap<String, &DailyMedAssignment> = daily
        .iter()
        .map(|item| (item.medication.id.clone(), item))
        .collect();

    let mut bundle_member_med_ids: HashSet<String> = HashSet::new();
    let mut bundle_choices: Vec<MedIntakeMenuChoice> = Vec::new();

    for bundle in &bundles {
        let mut all_due = true;
        let mut max_wait: Option<i32> = None;
        for item in &bundle.items {
            let Some(daily_item) = daily_by_med.get(&item.medication_id) else {
                all_due = false;
                break;
            };
            if daily_item.assignment.optional {
                all_due = false;
                break;
            }
            if !crate::domain::medication::assignment_due_on(&daily_item.assignment, date) {
                all_due = false;
                break;
            }
            let taken = taken_today
                .get(&daily_item.assignment.id)
                .copied()
                .unwrap_or(0);
            if taken >= daily_item.assignment.frequency.expected_doses() {
                all_due = false;
                break;
            }
            if let Some(w) = daily_item.assignment.meal_wait_minutes {
                max_wait = Some(max_wait.unwrap_or(0).max(w));
            }
        }
        if all_due {
            for item in &bundle.items {
                bundle_member_med_ids.insert(item.medication_id.clone());
            }
            bundle_choices.push(MedIntakeMenuChoice {
                label: bundle.name.clone(),
                medication_id: None,
                assignment_id: None,
                bundle_id: Some(bundle.id.clone()),
                kind: MenuChoiceKind::Bundle,
                fractions: None,
                fraction_labels: None,
                meal_wait_minutes: max_wait,
            });
        }
    }

    let mut choices = Vec::new();
    for item in &daily {
        if bundle_member_med_ids.contains(&item.medication.id) {
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

        let label = menu_label(item);
        let kind = choice_kind(item);
        let is_pill_choice = kind == MenuChoiceKind::OptionalPill;
        choices.push(MedIntakeMenuChoice {
            label,
            medication_id: Some(item.medication.id.clone()),
            assignment_id: Some(item.assignment.id.clone()),
            bundle_id: None,
            kind,
            fractions: is_pill_choice.then(pill_fractions),
            fraction_labels: is_pill_choice.then(pill_fraction_labels),
            meal_wait_minutes: item.assignment.meal_wait_minutes,
        });
    }
    choices.extend(bundle_choices);

    choices.sort_by(|a, b| {
        a.kind
            .sort_key()
            .cmp(&b.kind.sort_key())
            .then_with(|| a.label.cmp(&b.label))
    });
    disambiguate_labels(&mut choices);
    let labels = choices.iter().map(|choice| choice.label.clone()).collect();
    let lines = choices
        .iter()
        .map(|choice| {
            let fractions_csv = choice
                .fraction_labels
                .as_ref()
                .map(|values| values.join(","));
            // Use bundle_id for bundle choices, assignment_id for others.
            let id = choice
                .bundle_id
                .as_deref()
                .or(choice.assignment_id.as_deref())
                .unwrap_or("");
            encode_line(&choice.label, id, choice.kind, fractions_csv.as_deref())
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
        assert_eq!(
            line,
            "Gabapentin · As needed|assign-abc|optional_pill|1,1/2"
        );
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
            medication_id: Some("med-1".into()),
            assignment_id: Some("assign-1".into()),
            bundle_id: None,
            kind: MenuChoiceKind::Scheduled,
            fractions: None,
            fraction_labels: None,
            meal_wait_minutes: None,
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
