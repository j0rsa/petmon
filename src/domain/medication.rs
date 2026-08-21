use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MedType {
    Pill,
    Liquid,
}

impl MedType {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "pill" => Some(Self::Pill),
            "liquid" => Some(Self::Liquid),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pill => "pill",
            Self::Liquid => "liquid",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PillShape {
    Freedom,
    Oval,
    Square,
    Capsule,
    Pentagon,
    Tear,
    Rectangle,
    Hexagon,
    Round,
    Triangle,
    DoubleCircle,
    Trapezoid,
    Octagon,
    Diamond,
}

impl PillShape {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "freedom" => Some(Self::Freedom),
            "oval" => Some(Self::Oval),
            "square" => Some(Self::Square),
            "capsule" => Some(Self::Capsule),
            "pentagon" => Some(Self::Pentagon),
            "tear" => Some(Self::Tear),
            "rectangle" => Some(Self::Rectangle),
            "hexagon" => Some(Self::Hexagon),
            "round" => Some(Self::Round),
            "triangle" => Some(Self::Triangle),
            "double_circle" => Some(Self::DoubleCircle),
            "trapezoid" => Some(Self::Trapezoid),
            "octagon" => Some(Self::Octagon),
            "diamond" => Some(Self::Diamond),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Freedom => "freedom",
            Self::Oval => "oval",
            Self::Square => "square",
            Self::Capsule => "capsule",
            Self::Pentagon => "pentagon",
            Self::Tear => "tear",
            Self::Rectangle => "rectangle",
            Self::Hexagon => "hexagon",
            Self::Round => "round",
            Self::Triangle => "triangle",
            Self::DoubleCircle => "double_circle",
            Self::Trapezoid => "trapezoid",
            Self::Octagon => "octagon",
            Self::Diamond => "diamond",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DoseFraction {
    Whole,
    Half,
    Third,
    Quarter,
    ThreeQuarter,
    Eighth,
    Sixteenth,
}

impl DoseFraction {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "whole" => Some(Self::Whole),
            "half" => Some(Self::Half),
            "third" => Some(Self::Third),
            "quarter" => Some(Self::Quarter),
            "three_quarter" => Some(Self::ThreeQuarter),
            "eighth" => Some(Self::Eighth),
            "sixteenth" => Some(Self::Sixteenth),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Whole => "whole",
            Self::Half => "half",
            Self::Third => "third",
            Self::Quarter => "quarter",
            Self::ThreeQuarter => "three_quarter",
            Self::Eighth => "eighth",
            Self::Sixteenth => "sixteenth",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Whole => "1",
            Self::Half => "½",
            Self::Third => "⅓",
            Self::Quarter => "¼",
            Self::ThreeQuarter => "¾",
            Self::Eighth => "⅛",
            Self::Sixteenth => "1/16",
        }
    }

    pub fn multiplier(self) -> f64 {
        match self {
            Self::Whole => 1.0,
            Self::Half => 0.5,
            Self::Third => 1.0 / 3.0,
            Self::Quarter => 0.25,
            Self::ThreeQuarter => 0.75,
            Self::Eighth => 0.125,
            Self::Sixteenth => 0.0625,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedFrequency {
    #[serde(default)]
    pub times: Vec<String>,
}

impl MedFrequency {
    pub fn default_json() -> String {
        r#"{"times":[]}"#.to_string()
    }

    pub fn from_json(raw: &str) -> Self {
        serde_json::from_str(raw).unwrap_or(Self { times: vec![] })
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| Self::default_json())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Medication {
    pub id: String,
    pub pet_id: Uuid,
    pub name: String,
    pub med_type: MedType,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMedication {
    pub pet_id: String,
    pub name: String,
    pub med_type: MedType,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMedication {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedFormulation {
    pub id: String,
    pub medication_id: String,
    pub tablet_strength_mg: Option<f64>,
    pub pill_shape: Option<PillShape>,
    pub liquid_concentration_mg_per_ml: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CreateMedFormulation {
    pub tablet_strength_mg: Option<f64>,
    pub pill_shape: Option<PillShape>,
    pub liquid_concentration_mg_per_ml: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedAssignment {
    pub id: String,
    pub medication_id: String,
    pub pet_id: Uuid,
    pub formulation_id: String,
    pub formulation: MedFormulation,
    pub dose_fraction: Option<DoseFraction>,
    pub liquid_dose_ml: Option<f64>,
    pub effective_dose_mg: Option<f64>,
    pub dose_label: String,
    pub frequency: MedFrequency,
    pub date_from: String,
    pub date_to: Option<String>,
    pub optional: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMedAssignment {
    pub medication_id: String,
    /// Reuse an existing formulation when only dose fraction or schedule changes.
    pub formulation_id: Option<String>,
    /// Required when creating a new formulation (strength or pill shape change).
    pub tablet_strength_mg: Option<f64>,
    pub pill_shape: Option<PillShape>,
    pub liquid_concentration_mg_per_ml: Option<f64>,
    pub dose_fraction: Option<DoseFraction>,
    pub liquid_dose_ml: Option<f64>,
    pub frequency: Option<MedFrequency>,
    pub date_from: String,
    pub date_to: Option<String>,
    pub optional: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ReviseMedAssignment {
    pub formulation_id: Option<String>,
    pub tablet_strength_mg: Option<f64>,
    pub pill_shape: Option<PillShape>,
    pub liquid_concentration_mg_per_ml: Option<f64>,
    pub dose_fraction: Option<DoseFraction>,
    pub liquid_dose_ml: Option<f64>,
    pub frequency: Option<MedFrequency>,
    pub effective_from: String,
    pub date_to: Option<String>,
    pub optional: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedIntakeRecord {
    pub id: String,
    pub pet_id: Uuid,
    pub medication_id: String,
    pub assignment_id: String,
    pub assignment: MedAssignment,
    pub dose_fraction_override: Option<DoseFraction>,
    pub liquid_dose_ml_override: Option<f64>,
    pub effective_dose_fraction: Option<DoseFraction>,
    pub effective_dose_mg: Option<f64>,
    pub dose_label: String,
    pub occurred_at: String,
    pub local_date: String,
    pub taken: bool,
    pub note: Option<String>,
    pub source_type: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMedIntakeRecord {
    pub pet_id: String,
    pub medication_id: String,
    pub assignment_id: Option<String>,
    pub dose_fraction_override: Option<DoseFraction>,
    pub liquid_dose_ml_override: Option<f64>,
    pub taken: Option<bool>,
    pub occurred_at: Option<String>,
    pub local_date: Option<String>,
    pub note: Option<String>,
    pub source_type: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MedIntakeRecordFilters {
    pub pet_id: Option<String>,
    pub medication_id: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MedAssignmentFilters {
    pub pet_id: Option<String>,
    pub medication_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyMedAssignment {
    pub medication: Medication,
    pub assignment: MedAssignment,
    pub intakes: Vec<MedIntakeRecord>,
}

pub fn day_before(date: &str) -> Option<String> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.pred_opt())
        .map(|d| d.format("%Y-%m-%d").to_string())
}

pub fn assignment_active_on(assignment: &MedAssignment, date: &str) -> bool {
    if assignment.date_from.as_str() > date {
        return false;
    }
    match &assignment.date_to {
        None => true,
        Some(to) => to.as_str() >= date,
    }
}

pub fn compute_effective_dose_mg(
    formulation: &MedFormulation,
    dose_fraction: Option<DoseFraction>,
    liquid_dose_ml: Option<f64>,
) -> Option<f64> {
    if let (Some(strength), Some(fraction)) = (formulation.tablet_strength_mg, dose_fraction) {
        return Some(strength * fraction.multiplier());
    }
    if let (Some(concentration), Some(ml)) = (
        formulation.liquid_concentration_mg_per_ml,
        liquid_dose_ml,
    ) {
        return Some(concentration * ml);
    }
    None
}

pub fn build_dose_label(
    med_type: MedType,
    formulation: &MedFormulation,
    dose_fraction: Option<DoseFraction>,
    liquid_dose_ml: Option<f64>,
    effective_dose_mg: Option<f64>,
) -> String {
    match med_type {
        MedType::Pill => {
            let fraction = dose_fraction.map(|f| f.label()).unwrap_or("?");
            let strength = formulation
                .tablet_strength_mg
                .map(|s| format!("{s}mg"))
                .unwrap_or_else(|| "?mg".to_string());
            match effective_dose_mg {
                Some(mg) => format!("{fraction} × {strength} = {mg:.2}mg"),
                None => format!("{fraction} × {strength}"),
            }
        }
        MedType::Liquid => {
            let ml = liquid_dose_ml
                .map(|v| format!("{v}ml"))
                .unwrap_or_else(|| "?ml".to_string());
            match effective_dose_mg {
                Some(mg) => format!("{ml} ({mg:.2}mg)"),
                None => ml,
            }
        }
    }
}

pub fn hydrate_assignment(
    med_type: MedType,
    assignment: MedAssignmentCore,
    formulation: MedFormulation,
) -> MedAssignment {
    let effective_dose_mg = compute_effective_dose_mg(
        &formulation,
        assignment.dose_fraction,
        assignment.liquid_dose_ml,
    );
    let dose_label = build_dose_label(
        med_type,
        &formulation,
        assignment.dose_fraction,
        assignment.liquid_dose_ml,
        effective_dose_mg,
    );
    MedAssignment {
        id: assignment.id,
        medication_id: assignment.medication_id,
        pet_id: assignment.pet_id,
        formulation_id: assignment.formulation_id,
        formulation,
        dose_fraction: assignment.dose_fraction,
        liquid_dose_ml: assignment.liquid_dose_ml,
        effective_dose_mg,
        dose_label,
        frequency: assignment.frequency,
        date_from: assignment.date_from,
        date_to: assignment.date_to,
        optional: assignment.optional,
        created_at: assignment.created_at,
        updated_at: assignment.updated_at,
    }
}

#[derive(Debug, Clone)]
pub struct MedAssignmentCore {
    pub id: String,
    pub medication_id: String,
    pub pet_id: Uuid,
    pub formulation_id: String,
    pub dose_fraction: Option<DoseFraction>,
    pub liquid_dose_ml: Option<f64>,
    pub frequency: MedFrequency,
    pub date_from: String,
    pub date_to: Option<String>,
    pub optional: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub fn hydrate_intake(
    med_type: MedType,
    intake: MedIntakeCore,
    assignment: MedAssignment,
) -> MedIntakeRecord {
    let effective_fraction = intake.dose_fraction_override.or(assignment.dose_fraction);
    let effective_ml = intake.liquid_dose_ml_override.or(assignment.liquid_dose_ml);
    let effective_dose_mg = compute_effective_dose_mg(
        &assignment.formulation,
        effective_fraction,
        effective_ml,
    );
    let dose_label = build_dose_label(
        med_type,
        &assignment.formulation,
        effective_fraction,
        effective_ml,
        effective_dose_mg,
    );
    MedIntakeRecord {
        id: intake.id,
        pet_id: intake.pet_id,
        medication_id: intake.medication_id,
        assignment_id: intake.assignment_id,
        assignment,
        dose_fraction_override: intake.dose_fraction_override,
        liquid_dose_ml_override: intake.liquid_dose_ml_override,
        effective_dose_fraction: effective_fraction,
        effective_dose_mg,
        dose_label,
        occurred_at: intake.occurred_at,
        local_date: intake.local_date,
        taken: intake.taken,
        note: intake.note,
        source_type: intake.source_type,
        created_at: intake.created_at,
    }
}

#[derive(Debug, Clone)]
pub struct MedIntakeCore {
    pub id: String,
    pub pet_id: Uuid,
    pub medication_id: String,
    pub assignment_id: String,
    pub dose_fraction_override: Option<DoseFraction>,
    pub liquid_dose_ml_override: Option<f64>,
    pub occurred_at: String,
    pub local_date: String,
    pub taken: bool,
    pub note: Option<String>,
    pub source_type: String,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dose_fraction_multiplier_values() {
        assert!((DoseFraction::Half.multiplier() - 0.5).abs() < f64::EPSILON);
        assert!((DoseFraction::Third.multiplier() - (1.0 / 3.0)).abs() < f64::EPSILON);
        assert!((DoseFraction::ThreeQuarter.multiplier() - 0.75).abs() < f64::EPSILON);
    }

    #[test]
    fn compute_effective_dose_mg_for_pill() {
        let formulation = MedFormulation {
            id: "f".into(),
            medication_id: "m".into(),
            tablet_strength_mg: Some(5.0),
            pill_shape: Some(PillShape::Round),
            liquid_concentration_mg_per_ml: None,
            created_at: String::new(),
        };
        assert!((compute_effective_dose_mg(&formulation, Some(DoseFraction::Half), None).unwrap()
            - 2.5)
            .abs()
            < f64::EPSILON);
    }
}
