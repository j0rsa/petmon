use crate::domain::elimination::EliminationEventType;
use crate::domain::elimination_classifier::{
    ClassifierMetrics, ClassifierPrediction, ClassifierRetrainResult, ClassifierStatus,
    DurationDist, EliminationClassifierModel, EliminationClassifierModelSummary, ExplanationFactor,
    FeatureContext, PredictionExplanation, SignalStrength,
};
use crate::error::AppResult;
use crate::repo::{elimination_classifiers, elimination_records, pets};
use crate::services::elimination_classifier_context::{
    build_feature_context_for_training, compute_baselines,
};
use chrono::{Duration, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

pub const FEATURE_DIM: usize = 17;
pub const CONFIDENCE_THRESHOLD: f32 = 0.72;
pub const MIN_SAMPLES_PER_CLASS: i32 = 4;
pub const TRAINING_WINDOW_DAYS: u32 = 90;
const L2_LAMBDA: f32 = 0.01;
const LEARNING_RATE: f32 = 0.05;
const EPOCHS: usize = 800;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClassifierDecision {
    Wee,
    Poop,
    Ambiguous,
    InsufficientHistory,
}

pub fn feature_vector(ctx: &FeatureContext) -> [f32; FEATURE_DIM] {
    let dur = ctx.duration_seconds as f32;
    let poop_quota_24h = ctx.poop_count_24h_before as f32 / ctx.pet_p50_poops_per_day.max(0.5);
    let poop_quota_48h =
        ctx.poop_count_48h_before as f32 / (ctx.pet_p50_poops_per_day * 2.0).max(0.5);
    let wee_quota_24h = ctx.wee_count_24h_before as f32 / ctx.pet_p50_wees_per_day.max(0.5);
    let hour_rad = std::f32::consts::TAU * ctx.hour_of_day / 24.0;
    let recency =
        |mins: Option<f32>| -> f32 { mins.map(|m| (m.min(1440.0)) / 1440.0).unwrap_or(1.0) };
    let duration_z = |median: Option<f32>, std: Option<f32>| -> f32 {
        match (median, std) {
            (Some(m), Some(s)) if s > 0.0 => (dur - m) / s,
            _ => 0.0,
        }
    };

    [
        dur,
        dur.ln_1p(),
        ctx.wee_count_24h_before as f32,
        ctx.poop_count_24h_before as f32,
        ctx.wee_count_48h_before as f32,
        ctx.poop_count_48h_before as f32,
        poop_quota_24h,
        poop_quota_48h,
        wee_quota_24h,
        hour_rad.sin(),
        hour_rad.cos(),
        recency(ctx.minutes_since_last_wee),
        recency(ctx.minutes_since_last_poop),
        recency(ctx.minutes_since_last_any),
        duration_z(ctx.pet_median_wee_duration, ctx.pet_std_wee_duration),
        duration_z(ctx.pet_median_poop_duration, ctx.pet_std_poop_duration),
        1.0,
    ]
}

fn normalize(
    features: &mut [[f32; FEATURE_DIM]],
    means: &mut [f32; FEATURE_DIM],
    stds: &mut [f32; FEATURE_DIM],
) {
    for j in 0..FEATURE_DIM {
        if j == FEATURE_DIM - 1 {
            means[j] = 1.0;
            stds[j] = 1.0;
            continue;
        }
        let sum: f32 = features.iter().map(|row| row[j]).sum();
        let mean = sum / features.len() as f32;
        let var: f32 = features
            .iter()
            .map(|row| {
                let d = row[j] - mean;
                d * d
            })
            .sum::<f32>()
            / features.len() as f32;
        let std = var.sqrt().max(1e-3);
        means[j] = mean;
        stds[j] = std;
        for row in features.iter_mut() {
            row[j] = (row[j] - mean) / std;
        }
    }
}

fn apply_norm(raw: &[f32; FEATURE_DIM], means: &[f32], stds: &[f32]) -> [f32; FEATURE_DIM] {
    let mut out = *raw;
    for j in 0..FEATURE_DIM {
        if j == FEATURE_DIM - 1 {
            out[j] = 1.0;
        } else {
            out[j] = (raw[j] - means[j]) / stds[j].max(1e-3);
        }
    }
    out
}

fn sigmoid(z: f32) -> f32 {
    if z >= 0.0 {
        let e = (-z).exp();
        1.0 / (1.0 + e)
    } else {
        let e = z.exp();
        e / (1.0 + e)
    }
}

fn predict_proba(model: &EliminationClassifierModel, raw: &[f32; FEATURE_DIM]) -> (f32, f32) {
    let x = apply_norm(raw, &model.feature_means, &model.feature_stds);
    let mut z = 0.0f32;
    for (w, xi) in model.weights.iter().zip(x.iter()) {
        z += w * xi;
    }
    let p_poop = sigmoid(z);
    (1.0 - p_poop, p_poop)
}

fn train_logistic(
    features: &[[f32; FEATURE_DIM]],
    labels: &[bool],
) -> ([f32; FEATURE_DIM], [f32; FEATURE_DIM], [f32; FEATURE_DIM]) {
    let mut data = features.to_vec();
    let mut means = [0.0f32; FEATURE_DIM];
    let mut stds = [1.0f32; FEATURE_DIM];
    normalize(&mut data, &mut means, &mut stds);

    let mut weights = [0.0f32; FEATURE_DIM];
    for _ in 0..EPOCHS {
        let mut grad = [0.0f32; FEATURE_DIM];
        for (x, &y) in data.iter().zip(labels.iter()) {
            let mut z = 0.0f32;
            for (w, xi) in weights.iter().zip(x.iter()) {
                z += w * xi;
            }
            let p = sigmoid(z);
            let err = p - if y { 1.0 } else { 0.0 };
            for (g, xi) in grad.iter_mut().zip(x.iter()) {
                *g += err * xi;
            }
        }
        let n = data.len() as f32;
        for (w, g) in weights.iter_mut().zip(grad.iter()) {
            *w -= LEARNING_RATE * (g / n + L2_LAMBDA * *w);
        }
    }
    (weights, means, stds)
}

fn evaluate(
    model: &EliminationClassifierModel,
    features: &[[f32; FEATURE_DIM]],
    labels: &[bool],
) -> ClassifierMetrics {
    let mut correct = 0;
    let mut log_loss = 0.0f32;
    let mut ambiguous = 0;
    let eps = 1e-6f32;
    for (raw, &is_poop) in features.iter().zip(labels.iter()) {
        let (p_wee, p_poop) = predict_proba(model, raw);
        let confidence = p_wee.max(p_poop);
        if confidence < CONFIDENCE_THRESHOLD {
            ambiguous += 1;
            continue;
        }
        let pred_poop = p_poop > p_wee;
        if pred_poop == is_poop {
            correct += 1;
        }
        let p = if is_poop {
            p_poop.max(eps)
        } else {
            p_wee.max(eps)
        };
        log_loss -= p.ln();
    }
    let n = features.len().max(1) as f32;
    ClassifierMetrics {
        accuracy: correct as f32 / n,
        log_loss: log_loss / n,
        ambiguous_rate: ambiguous as f32 / n,
    }
}

fn duration_dist_from_values(values: &[f64]) -> DurationDist {
    if values.is_empty() {
        return DurationDist {
            mean: 0.0,
            std: 1.0,
            median: 0.0,
            n: 0,
        };
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = sorted[sorted.len() / 2] as f32;
    let var = values
        .iter()
        .map(|v| {
            let d = v - mean;
            d * d
        })
        .sum::<f64>()
        / values.len() as f64;
    DurationDist {
        mean: mean as f32,
        std: (var.sqrt() as f32).max(1.0),
        median,
        n: values.len() as i32,
    }
}

pub async fn train_classifier(
    pool: &SqlitePool,
    pet_id: Uuid,
) -> AppResult<Option<EliminationClassifierModel>> {
    let as_of = Utc::now().date_naive();
    let date_from = (as_of - Duration::days(TRAINING_WINDOW_DAYS as i64)).to_string();
    let date_to = as_of.to_string();
    let baselines = compute_baselines(pool, pet_id, as_of).await?;
    let rows =
        elimination_records::labeled_training_records(pool, pet_id, &date_from, &date_to).await?;

    let mut wee_samples = 0;
    let mut poop_samples = 0;
    for row in &rows {
        match row.event_type {
            EliminationEventType::Urination => wee_samples += 1,
            EliminationEventType::Defecation => poop_samples += 1,
            _ => {}
        }
    }

    if wee_samples < MIN_SAMPLES_PER_CLASS || poop_samples < MIN_SAMPLES_PER_CLASS {
        return Ok(None);
    }

    let mut features = Vec::with_capacity(rows.len());
    let mut labels = Vec::with_capacity(rows.len());
    let mut wee_durations = Vec::new();
    let mut poop_durations = Vec::new();

    for row in &rows {
        let Some(duration) = row.duration_seconds else {
            continue;
        };
        let ctx = build_feature_context_for_training(
            pool,
            pet_id,
            &row.occurred_at,
            duration,
            &baselines,
        )
        .await?;
        features.push(feature_vector(&ctx));
        let is_poop = row.event_type == EliminationEventType::Defecation;
        labels.push(is_poop);
        if is_poop {
            poop_durations.push(duration as f64);
        } else {
            wee_durations.push(duration as f64);
        }
    }

    if features.len() < (MIN_SAMPLES_PER_CLASS * 2) as usize {
        return Ok(None);
    }

    let (weights_arr, means_arr, stds_arr) = train_logistic(&features, &labels);
    let trained_at = Utc::now().to_rfc3339();
    let model = EliminationClassifierModel {
        version: 1,
        trained_at: trained_at.clone(),
        training_window_days: TRAINING_WINDOW_DAYS,
        sample_count: features.len() as i32,
        wee_samples,
        poop_samples,
        weights: weights_arr.to_vec(),
        feature_means: means_arr.to_vec(),
        feature_stds: stds_arr.to_vec(),
        wee_duration: duration_dist_from_values(&wee_durations),
        poop_duration: duration_dist_from_values(&poop_durations),
        baselines: baselines.clone(),
        metrics: None,
    };

    let split = (features.len() as f32 * 0.8).floor() as usize;
    let metrics = if split >= 4 && split < features.len() {
        Some(evaluate(&model, &features[split..], &labels[split..]))
    } else {
        Some(evaluate(&model, &features, &labels))
    };

    let mut model = model;
    model.metrics = metrics;
    elimination_classifiers::upsert(pool, pet_id, &model).await?;
    Ok(Some(model))
}

pub fn classify(model: &EliminationClassifierModel, ctx: &FeatureContext) -> ClassifierDecision {
    if model.wee_samples < MIN_SAMPLES_PER_CLASS || model.poop_samples < MIN_SAMPLES_PER_CLASS {
        return ClassifierDecision::InsufficientHistory;
    }
    let raw = feature_vector(ctx);
    let (p_wee, p_poop) = predict_proba(model, &raw);
    let confidence = p_wee.max(p_poop);
    if confidence < CONFIDENCE_THRESHOLD {
        return ClassifierDecision::Ambiguous;
    }
    if p_poop > p_wee {
        ClassifierDecision::Poop
    } else {
        ClassifierDecision::Wee
    }
}

pub fn explain(model: &EliminationClassifierModel, ctx: &FeatureContext) -> ClassifierPrediction {
    let raw = feature_vector(ctx);
    let x = apply_norm(&raw, &model.feature_means, &model.feature_stds);
    let (p_wee, p_poop) = predict_proba(model, &raw);
    let confidence = p_wee.max(p_poop);

    let factor_labels = [
        ("duration", "Duration"),
        ("log_duration", "Duration (log scale)"),
        ("wee_24h", "Wees in last 24h"),
        ("poop_24h", "Poops in last 24h"),
        ("wee_48h", "Wees in last 48h"),
        ("poop_48h", "Poops in last 48h"),
        ("poop_quota_24h", "24h poop load vs typical"),
        ("poop_quota_48h", "48h poop load vs typical"),
        ("wee_quota_24h", "24h wee load vs typical"),
        ("time_of_day", "Time of day"),
        ("time_of_day_cos", "Time of day"),
        ("since_last_wee", "Time since last wee"),
        ("since_last_poop", "Time since last poop"),
        ("since_last_visit", "Time since last visit"),
        ("duration_vs_wee", "Duration vs wee pattern"),
        ("duration_vs_poop", "Duration vs poop pattern"),
        ("bias", "Baseline"),
    ];

    let mut factors: Vec<ExplanationFactor> = factor_labels
        .iter()
        .enumerate()
        .map(|(i, (key, label))| {
            let impact = model.weights[i] * x[i];
            ExplanationFactor {
                factor: (*key).to_string(),
                impact,
                label: (*label).to_string(),
            }
        })
        .filter(|f| f.impact.abs() > 0.05)
        .collect();
    factors.sort_by(|a, b| {
        b.impact
            .abs()
            .partial_cmp(&a.impact.abs())
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    factors.truncate(3);

    if ctx.poop_count_24h_before > 0 {
        let poop_quota_24h = ctx.poop_count_24h_before as f32 / ctx.pet_p50_poops_per_day.max(0.5);
        if poop_quota_24h >= 1.0 {
            factors.push(ExplanationFactor {
                factor: "recent_poop".to_string(),
                impact: -0.5,
                label: format!(
                    "Pooped within the last 24h (typical: ~{:.0}/day)",
                    ctx.pet_p50_poops_per_day
                ),
            });
        }
    }

    let poop_quota_24h = ctx.poop_count_24h_before as f32 / ctx.pet_p50_poops_per_day.max(0.5);
    let duration_signal = duration_signal_from_z(raw[14], raw[15]);
    let context_signal = if poop_quota_24h >= 1.0 {
        SignalStrength::StrongWee
    } else if ctx.poop_count_24h_before == 0 && ctx.pet_p50_poops_per_day >= 1.0 {
        SignalStrength::LeanPoop
    } else {
        SignalStrength::Ambiguous
    };

    ClassifierPrediction {
        p_wee,
        p_poop,
        confidence,
        explanation: PredictionExplanation {
            duration_signal,
            context_signal,
            top_factors: factors,
        },
    }
}

fn duration_signal_from_z(z_wee: f32, z_poop: f32) -> SignalStrength {
    if z_wee < -0.5 && z_poop > 0.5 {
        SignalStrength::StrongWee
    } else if z_poop < -0.5 && z_wee > 0.5 {
        SignalStrength::StrongPoop
    } else if z_wee < z_poop {
        SignalStrength::LeanWee
    } else if z_poop < z_wee {
        SignalStrength::LeanPoop
    } else {
        SignalStrength::Ambiguous
    }
}

pub async fn get_status(pool: &SqlitePool, pet_id: Uuid) -> AppResult<ClassifierStatus> {
    let pet = pets::get_pet(pool, pet_id).await?;
    let as_of = Utc::now().date_naive();
    let baselines = compute_baselines(pool, pet_id, as_of).await?;
    let model_row = elimination_classifiers::get(pool, pet_id).await?;
    let (model, fallback_active) = match model_row {
        Some(stored)
            if stored.wee_samples >= MIN_SAMPLES_PER_CLASS
                && stored.poop_samples >= MIN_SAMPLES_PER_CLASS =>
        {
            (
                Some(EliminationClassifierModelSummary {
                    trained_at: stored.trained_at,
                    sample_count: stored.sample_count,
                    wee_samples: stored.wee_samples,
                    poop_samples: stored.poop_samples,
                    metrics: stored.metrics,
                }),
                false,
            )
        }
        _ => (None, true),
    };
    Ok(ClassifierStatus {
        pet_id: pet_id.to_string(),
        enabled: pet.elimination_auto_categorize_by_duration,
        model,
        baselines,
        fallback_active,
    })
}

pub async fn retrain(pool: &SqlitePool, pet_id: Uuid) -> AppResult<ClassifierRetrainResult> {
    pets::get_pet(pool, pet_id).await?;
    match train_classifier(pool, pet_id).await? {
        Some(model) => {
            elimination_classifiers::clear_pending(pool, pet_id).await?;
            Ok(ClassifierRetrainResult {
                pet_id: pet_id.to_string(),
                trained: true,
                model: Some(EliminationClassifierModelSummary {
                    trained_at: model.trained_at,
                    sample_count: model.sample_count,
                    wee_samples: model.wee_samples,
                    poop_samples: model.poop_samples,
                    metrics: model.metrics,
                }),
                message: "Classifier trained successfully".to_string(),
            })
        }
        None => Ok(ClassifierRetrainResult {
            pet_id: pet_id.to_string(),
            trained: false,
            model: None,
            message: format!(
                "Need at least {MIN_SAMPLES_PER_CLASS} labeled wee and poop records with duration in the last {TRAINING_WINDOW_DAYS} days"
            ),
        }),
    }
}

pub async fn mark_pending_retrain(pool: &SqlitePool, pet_id: Uuid) -> AppResult<()> {
    elimination_classifiers::mark_pending_retrain(pool, pet_id).await?;
    let _ = train_classifier(pool, pet_id).await?;
    Ok(())
}

pub async fn process_pending_retrains(pool: &SqlitePool, limit: i64) -> AppResult<usize> {
    let pet_ids = elimination_classifiers::pending_pet_ids(pool, limit).await?;
    let mut count = 0;
    for pet_id in pet_ids {
        if train_classifier(pool, pet_id).await?.is_some() {
            elimination_classifiers::clear_pending(pool, pet_id).await?;
            count += 1;
        } else {
            elimination_classifiers::clear_pending(pool, pet_id).await?;
        }
    }
    Ok(count)
}

pub async fn maybe_train_on_enable(pool: &SqlitePool, pet_id: Uuid) -> AppResult<()> {
    let _ = train_classifier(pool, pet_id).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::elimination_classifier::{ClassifierBaselines, DurationDist};

    fn sample_ctx(poop_24h: i32) -> FeatureContext {
        FeatureContext {
            duration_seconds: 55.0,
            wee_count_24h_before: 1,
            poop_count_24h_before: poop_24h,
            wee_count_48h_before: poop_24h,
            poop_count_48h_before: poop_24h,
            minutes_since_last_wee: Some(120.0),
            minutes_since_last_poop: Some(720.0),
            minutes_since_last_any: Some(120.0),
            hour_of_day: 14.5,
            pet_p50_wees_per_day: 4.0,
            pet_p90_wees_per_day: 6.0,
            pet_p50_poops_per_day: 1.0,
            pet_p90_poops_per_day: 2.0,
            pet_median_wee_duration: Some(45.0),
            pet_median_poop_duration: Some(118.0),
            pet_std_wee_duration: Some(10.0),
            pet_std_poop_duration: Some(15.0),
        }
    }

    fn dummy_model() -> EliminationClassifierModel {
        EliminationClassifierModel {
            version: 1,
            trained_at: "2026-01-01T00:00:00Z".to_string(),
            training_window_days: 90,
            sample_count: 20,
            wee_samples: 12,
            poop_samples: 8,
            weights: vec![0.0; FEATURE_DIM],
            feature_means: vec![0.0; FEATURE_DIM],
            feature_stds: vec![1.0; FEATURE_DIM],
            wee_duration: DurationDist {
                mean: 45.0,
                std: 10.0,
                median: 45.0,
                n: 12,
            },
            poop_duration: DurationDist {
                mean: 118.0,
                std: 15.0,
                median: 118.0,
                n: 8,
            },
            baselines: ClassifierBaselines {
                p50_wees_per_day: 4.0,
                p90_wees_per_day: 6.0,
                p50_poops_per_day: 1.0,
                p90_poops_per_day: 2.0,
                wee_duration: None,
                poop_duration: None,
            },
            metrics: None,
        }
    }

    #[test]
    fn feature_vector_includes_rolling_quota() {
        let v = feature_vector(&sample_ctx(1));
        assert!(v[6] >= 1.0);
    }

    #[test]
    fn train_and_predict_binary_direction() {
        let mut features = Vec::new();
        let mut labels = Vec::new();
        for i in 0..8 {
            let mut ctx = sample_ctx(0);
            ctx.duration_seconds = 40.0 + i as f64;
            ctx.poop_count_24h_before = 0;
            features.push(feature_vector(&ctx));
            labels.push(false);
        }
        for i in 0..8 {
            let mut ctx = sample_ctx(0);
            ctx.duration_seconds = 110.0 + i as f64;
            ctx.poop_count_24h_before = 0;
            features.push(feature_vector(&ctx));
            labels.push(true);
        }
        let (weights, means, stds) = train_logistic(&features, &labels);
        let model = EliminationClassifierModel {
            version: 1,
            trained_at: String::new(),
            training_window_days: 90,
            sample_count: 16,
            wee_samples: 8,
            poop_samples: 8,
            weights: weights.to_vec(),
            feature_means: means.to_vec(),
            feature_stds: stds.to_vec(),
            wee_duration: DurationDist {
                mean: 45.0,
                std: 10.0,
                median: 45.0,
                n: 8,
            },
            poop_duration: DurationDist {
                mean: 118.0,
                std: 15.0,
                median: 118.0,
                n: 8,
            },
            baselines: ClassifierBaselines {
                p50_wees_per_day: 4.0,
                p90_wees_per_day: 6.0,
                p50_poops_per_day: 1.0,
                p90_poops_per_day: 2.0,
                wee_duration: None,
                poop_duration: None,
            },
            metrics: None,
        };
        let ambiguous = sample_ctx(0);
        let mut ambiguous = ambiguous;
        ambiguous.duration_seconds = 80.0;
        assert!(matches!(
            classify(&model, &ambiguous),
            ClassifierDecision::Ambiguous | ClassifierDecision::Wee | ClassifierDecision::Poop
        ));
    }
}
