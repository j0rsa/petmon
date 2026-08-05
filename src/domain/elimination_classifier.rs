use serde::{Deserialize, Serialize};

/// Snapshot of elimination context at prediction time (rolling windows, not calendar day).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FeatureContext {
    pub duration_seconds: f64,
    pub wee_count_24h_before: i32,
    pub poop_count_24h_before: i32,
    pub wee_count_48h_before: i32,
    pub poop_count_48h_before: i32,
    pub minutes_since_last_wee: Option<f32>,
    pub minutes_since_last_poop: Option<f32>,
    pub minutes_since_last_any: Option<f32>,
    pub hour_of_day: f32,
    pub pet_p50_wees_per_day: f32,
    pub pet_p90_wees_per_day: f32,
    pub pet_p50_poops_per_day: f32,
    pub pet_p90_poops_per_day: f32,
    pub pet_median_wee_duration: Option<f32>,
    pub pet_median_poop_duration: Option<f32>,
    pub pet_std_wee_duration: Option<f32>,
    pub pet_std_poop_duration: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DurationDist {
    pub mean: f32,
    pub std: f32,
    pub median: f32,
    pub n: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClassifierBaselines {
    pub p50_wees_per_day: f32,
    pub p90_wees_per_day: f32,
    pub p50_poops_per_day: f32,
    pub p90_poops_per_day: f32,
    pub wee_duration: Option<DurationDist>,
    pub poop_duration: Option<DurationDist>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClassifierMetrics {
    pub accuracy: f32,
    pub log_loss: f32,
    pub ambiguous_rate: f32,
}

/// Per-pet binary logistic regression model (poop vs wee) with feature normalization.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EliminationClassifierModel {
    pub version: u32,
    pub trained_at: String,
    pub training_window_days: u32,
    pub sample_count: i32,
    pub wee_samples: i32,
    pub poop_samples: i32,
    pub weights: Vec<f32>,
    pub feature_means: Vec<f32>,
    pub feature_stds: Vec<f32>,
    pub wee_duration: DurationDist,
    pub poop_duration: DurationDist,
    pub baselines: ClassifierBaselines,
    pub metrics: Option<ClassifierMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SignalStrength {
    StrongWee,
    LeanWee,
    Ambiguous,
    LeanPoop,
    StrongPoop,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExplanationFactor {
    pub factor: String,
    pub impact: f32,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PredictionExplanation {
    pub duration_signal: SignalStrength,
    pub context_signal: SignalStrength,
    pub top_factors: Vec<ExplanationFactor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClassifierPrediction {
    pub p_wee: f32,
    pub p_poop: f32,
    pub confidence: f32,
    pub explanation: PredictionExplanation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClassifierStatus {
    pub pet_id: String,
    pub enabled: bool,
    pub model: Option<EliminationClassifierModelSummary>,
    pub baselines: ClassifierBaselines,
    pub fallback_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EliminationClassifierModelSummary {
    pub trained_at: String,
    pub sample_count: i32,
    pub wee_samples: i32,
    pub poop_samples: i32,
    pub metrics: Option<ClassifierMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClassifierRetrainResult {
    pub pet_id: String,
    pub trained: bool,
    pub model: Option<EliminationClassifierModelSummary>,
    pub message: String,
}
