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
    #[serde(rename = "round_1_precut")]
    Round1Precut,
    #[serde(rename = "round_2_precut")]
    Round2Precut,
    #[serde(rename = "ellipse_1_precut")]
    Ellipse1Precut,
}

impl PillShape {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "round_1_precut" => Some(Self::Round1Precut),
            "round_2_precut" => Some(Self::Round2Precut),
            "ellipse_1_precut" => Some(Self::Ellipse1Precut),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Round1Precut => "round_1_precut",
            Self::Round2Precut => "round_2_precut",
            Self::Ellipse1Precut => "ellipse_1_precut",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PillFraction {
    Half,
    Quarter,
    Eighth,
    Sixteenth,
}

impl PillFraction {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "half" => Some(Self::Half),
            "quarter" => Some(Self::Quarter),
            "eighth" => Some(Self::Eighth),
            "sixteenth" => Some(Self::Sixteenth),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Half => "half",
            Self::Quarter => "quarter",
            Self::Eighth => "eighth",
            Self::Sixteenth => "sixteenth",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Half => "½",
            Self::Quarter => "¼",
            Self::Eighth => "⅛",
            Self::Sixteenth => "1/16",
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
    pub pill_shape: Option<PillShape>,
    pub pill_fraction: Option<PillFraction>,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMedication {
    pub pet_id: String,
    pub name: String,
    pub med_type: MedType,
    pub pill_shape: Option<PillShape>,
    pub pill_fraction: Option<PillFraction>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMedication {
    pub name: Option<String>,
    pub pill_shape: Option<PillShape>,
    pub pill_fraction: Option<PillFraction>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedAssignment {
    pub id: String,
    pub medication_id: String,
    pub pet_id: Uuid,
    pub dosage: String,
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
    pub dosage: String,
    pub frequency: Option<MedFrequency>,
    pub date_from: String,
    pub date_to: Option<String>,
    pub optional: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ReviseMedAssignment {
    pub dosage: String,
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
    pub assignment_id: Option<String>,
    pub occurred_at: String,
    pub local_date: String,
    pub dosage: String,
    pub taken: bool,
    pub note: Option<String>,
    pub source_type: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMedIntakeRecord {
    pub pet_id: String,
    pub medication_id: String,
    pub dosage: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_before_subtracts_one_day() {
        assert_eq!(day_before("2026-03-15").as_deref(), Some("2026-03-14"));
    }

    #[test]
    fn assignment_active_on_respects_bounds() {
        let assignment = MedAssignment {
            id: "a".into(),
            medication_id: "m".into(),
            pet_id: Uuid::nil(),
            dosage: "1".into(),
            frequency: MedFrequency { times: vec![] },
            date_from: "2026-03-01".into(),
            date_to: Some("2026-03-10".into()),
            optional: false,
            created_at: String::new(),
            updated_at: String::new(),
        };
        assert!(!assignment_active_on(&assignment, "2026-02-28"));
        assert!(assignment_active_on(&assignment, "2026-03-05"));
        assert!(assignment_active_on(&assignment, "2026-03-10"));
        assert!(!assignment_active_on(&assignment, "2026-03-11"));
    }
}
