use crate::domain::elimination::EliminationEventType;
use crate::error::AppResult;
use crate::repo::{elimination_classifiers, elimination_records, pets};
use crate::services::elimination_classifier::{self, ClassifierDecision, MIN_SAMPLES_PER_CLASS};
use crate::services::elimination_classifier_context::build_feature_context;
use sqlx::SqlitePool;
use uuid::Uuid;

/// Relative deviation from bucket center (25%) — legacy fallback only.
pub const DEVIATION_RATIO: f64 = 0.25;

/// Minimum absolute deviation in seconds regardless of bucket center.
pub const MIN_ABSOLUTE_DEVIATION_SECS: f64 = 10.0;

/// Minimum categorized records with duration before a bucket is used for matching.
pub const MIN_SAMPLES_PER_BUCKET: i64 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutoCategorizeFailureReason {
    InsufficientHistory,
    Ambiguous,
    NoMatch,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AutoCategorizeAttempt {
    pub event_type: EliminationEventType,
    pub failure: Option<AutoCategorizeFailureReason>,
    pub is_auto_categorized: bool,
    pub auto_categorize_confidence: Option<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DurationBucket {
    pub sample_count: i64,
    pub avg_duration_seconds: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DurationBuckets {
    pub wee: Option<DurationBucket>,
    pub poo: Option<DurationBucket>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ClassifyOutcome {
    Matched(EliminationEventType),
    Ambiguous,
    NoMatch,
    InsufficientHistory,
}

impl DurationBuckets {
    pub fn from_profile(
        wee_count: i64,
        wee_avg: Option<f64>,
        poo_count: i64,
        poo_avg: Option<f64>,
    ) -> Self {
        Self {
            wee: bucket_from(wee_count, wee_avg),
            poo: bucket_from(poo_count, poo_avg),
        }
    }
}

fn bucket_from(count: i64, avg: Option<f64>) -> Option<DurationBucket> {
    avg.map(|avg_duration_seconds| DurationBucket {
        sample_count: count,
        avg_duration_seconds,
    })
}

pub fn within_deviation(duration_seconds: i64, center: f64) -> bool {
    let deviation = (center * DEVIATION_RATIO).max(MIN_ABSOLUTE_DEVIATION_SECS);
    (duration_seconds as f64 - center).abs() <= deviation
}

fn bucket_ready(bucket: Option<DurationBucket>) -> bool {
    bucket
        .map(|b| b.sample_count >= MIN_SAMPLES_PER_BUCKET)
        .unwrap_or(false)
}

/// Match a duration against wee/poo buckets. Returns a type only when exactly one bucket fits.
pub fn classify_by_duration(
    duration_seconds: i64,
    buckets: DurationBuckets,
) -> Option<EliminationEventType> {
    match classify_by_duration_detailed(duration_seconds, buckets) {
        ClassifyOutcome::Matched(event_type) => Some(event_type),
        _ => None,
    }
}

fn classify_by_duration_detailed(
    duration_seconds: i64,
    buckets: DurationBuckets,
) -> ClassifyOutcome {
    let wee_ready = bucket_ready(buckets.wee);
    let poo_ready = bucket_ready(buckets.poo);

    if !wee_ready && !poo_ready {
        return ClassifyOutcome::InsufficientHistory;
    }

    let wee_match = buckets.wee.and_then(|bucket| {
        if wee_ready && within_deviation(duration_seconds, bucket.avg_duration_seconds) {
            Some(EliminationEventType::Urination)
        } else {
            None
        }
    });
    let poo_match = buckets.poo.and_then(|bucket| {
        if poo_ready && within_deviation(duration_seconds, bucket.avg_duration_seconds) {
            Some(EliminationEventType::Defecation)
        } else {
            None
        }
    });

    match (wee_match, poo_match) {
        (Some(wee), None) => ClassifyOutcome::Matched(wee),
        (None, Some(poo)) => ClassifyOutcome::Matched(poo),
        (Some(_), Some(_)) => ClassifyOutcome::Ambiguous,
        _ => ClassifyOutcome::NoMatch,
    }
}

pub async fn load_duration_buckets(pool: &SqlitePool, pet_id: Uuid) -> AppResult<DurationBuckets> {
    let profile = elimination_records::duration_profile(pool, pet_id).await?;
    Ok(DurationBuckets {
        wee: profile.wee.map(|b| DurationBucket {
            sample_count: b.sample_count,
            avg_duration_seconds: b.avg_duration_seconds,
        }),
        poo: profile.poo.map(|b| DurationBucket {
            sample_count: b.sample_count,
            avg_duration_seconds: b.avg_duration_seconds,
        }),
    })
}

fn map_classifier_decision(
    decision: ClassifierDecision,
) -> Result<EliminationEventType, AutoCategorizeFailureReason> {
    match decision {
        ClassifierDecision::Wee => Ok(EliminationEventType::Urination),
        ClassifierDecision::Poop => Ok(EliminationEventType::Defecation),
        ClassifierDecision::Ambiguous => Err(AutoCategorizeFailureReason::Ambiguous),
        ClassifierDecision::InsufficientHistory => {
            Err(AutoCategorizeFailureReason::InsufficientHistory)
        }
    }
}

fn attempt_without_auto(event_type: EliminationEventType) -> AutoCategorizeAttempt {
    AutoCategorizeAttempt {
        event_type,
        failure: None,
        is_auto_categorized: false,
        auto_categorize_confidence: None,
    }
}

fn attempt_failed(reason: AutoCategorizeFailureReason) -> AutoCategorizeAttempt {
    AutoCategorizeAttempt {
        event_type: EliminationEventType::General,
        failure: Some(reason),
        is_auto_categorized: false,
        auto_categorize_confidence: None,
    }
}

pub async fn attempt_auto_categorize(
    pool: &SqlitePool,
    pet_id: Uuid,
    event_type: EliminationEventType,
    duration_seconds: Option<i64>,
    occurred_at: &str,
) -> AppResult<AutoCategorizeAttempt> {
    if event_type != EliminationEventType::General {
        return Ok(attempt_without_auto(event_type));
    }
    let Some(duration) = duration_seconds else {
        return Ok(attempt_without_auto(event_type));
    };

    let pet = pets::get_pet(pool, pet_id).await?;
    if !pet.elimination_auto_categorize_by_duration {
        return Ok(attempt_without_auto(event_type));
    }

    if let Some(model) = elimination_classifiers::get(pool, pet_id).await? {
        if model.wee_samples >= MIN_SAMPLES_PER_CLASS && model.poop_samples >= MIN_SAMPLES_PER_CLASS
        {
            let ctx = build_feature_context(pool, pet_id, occurred_at, duration).await?;
            let decision = elimination_classifier::classify(&model, &ctx);
            match map_classifier_decision(decision) {
                Ok(event_type) => {
                    let prediction = elimination_classifier::explain(&model, &ctx);
                    return Ok(AutoCategorizeAttempt {
                        event_type,
                        failure: None,
                        is_auto_categorized: true,
                        auto_categorize_confidence: Some(prediction.confidence),
                    });
                }
                Err(AutoCategorizeFailureReason::Ambiguous) => {
                    return Ok(attempt_failed(AutoCategorizeFailureReason::Ambiguous));
                }
                Err(AutoCategorizeFailureReason::InsufficientHistory) => {}
                Err(AutoCategorizeFailureReason::NoMatch) => {}
            }
        }
    }

    let buckets = load_duration_buckets(pool, pet_id).await?;
    match classify_by_duration_detailed(duration, buckets) {
        ClassifyOutcome::Matched(event_type) => Ok(AutoCategorizeAttempt {
            event_type,
            failure: None,
            is_auto_categorized: true,
            auto_categorize_confidence: None,
        }),
        ClassifyOutcome::Ambiguous => Ok(attempt_failed(AutoCategorizeFailureReason::Ambiguous)),
        ClassifyOutcome::NoMatch => Ok(attempt_failed(AutoCategorizeFailureReason::NoMatch)),
        ClassifyOutcome::InsufficientHistory => Ok(attempt_failed(
            AutoCategorizeFailureReason::InsufficientHistory,
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn buckets(wee_avg: f64, wee_count: i64, poo_avg: f64, poo_count: i64) -> DurationBuckets {
        DurationBuckets::from_profile(wee_count, Some(wee_avg), poo_count, Some(poo_avg))
    }

    #[test]
    fn within_deviation_uses_ratio_and_floor() {
        assert!(within_deviation(50, 45.0));
        assert!(within_deviation(35, 45.0));
        assert!(!within_deviation(20, 45.0));
        assert!(within_deviation(15, 10.0));
        assert!(!within_deviation(25, 10.0));
    }

    #[test]
    fn classify_matches_single_bucket_only() {
        let b = buckets(45.0, 3, 120.0, 3);
        assert_eq!(
            classify_by_duration(45, b),
            Some(EliminationEventType::Urination)
        );
        assert_eq!(
            classify_by_duration(118, b),
            Some(EliminationEventType::Defecation)
        );
        assert_eq!(classify_by_duration(80, b), None);
        assert_eq!(
            classify_by_duration_detailed(80, b),
            ClassifyOutcome::NoMatch
        );
    }

    #[test]
    fn classify_requires_minimum_samples() {
        let b = buckets(45.0, 1, 120.0, 3);
        assert_eq!(classify_by_duration(45, b), None);
        assert_eq!(
            classify_by_duration(118, b),
            Some(EliminationEventType::Defecation)
        );
    }

    #[test]
    fn insufficient_history_when_no_ready_buckets() {
        let b = buckets(45.0, 1, 120.0, 1);
        assert_eq!(
            classify_by_duration_detailed(45, b),
            ClassifyOutcome::InsufficientHistory
        );
    }
}
