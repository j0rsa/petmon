use crate::domain::elimination::EliminationEventType;
use crate::error::AppResult;
use crate::repo::{elimination_records, pets};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Minimum categorized records with duration before a bucket is used for matching.
pub const MIN_SAMPLES_PER_BUCKET: i64 = 2;

/// Relative deviation from bucket center (25%).
pub const DEVIATION_RATIO: f64 = 0.25;

/// Minimum absolute deviation in seconds regardless of bucket center.
pub const MIN_ABSOLUTE_DEVIATION_SECS: f64 = 10.0;

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

/// Match a duration against wee/poo buckets. Returns a type only when exactly one bucket fits.
pub fn classify_by_duration(
    duration_seconds: i64,
    buckets: DurationBuckets,
) -> Option<EliminationEventType> {
    let wee_match = buckets.wee.and_then(|bucket| {
        if bucket.sample_count >= MIN_SAMPLES_PER_BUCKET
            && within_deviation(duration_seconds, bucket.avg_duration_seconds)
        {
            Some(EliminationEventType::Urination)
        } else {
            None
        }
    });
    let poo_match = buckets.poo.and_then(|bucket| {
        if bucket.sample_count >= MIN_SAMPLES_PER_BUCKET
            && within_deviation(duration_seconds, bucket.avg_duration_seconds)
        {
            Some(EliminationEventType::Defecation)
        } else {
            None
        }
    });

    match (wee_match, poo_match) {
        (Some(wee), None) => Some(wee),
        (None, Some(poo)) => Some(poo),
        _ => None,
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

pub async fn maybe_auto_categorize(
    pool: &SqlitePool,
    pet_id: Uuid,
    event_type: EliminationEventType,
    duration_seconds: Option<i64>,
) -> AppResult<EliminationEventType> {
    if event_type != EliminationEventType::General {
        return Ok(event_type);
    }
    let Some(duration) = duration_seconds else {
        return Ok(event_type);
    };

    let pet = pets::get_pet(pool, pet_id).await?;
    if !pet.elimination_auto_categorize_by_duration {
        return Ok(event_type);
    }

    let buckets = load_duration_buckets(pool, pet_id).await?;
    Ok(classify_by_duration(duration, buckets).unwrap_or(event_type))
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
}
