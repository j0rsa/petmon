use crate::domain::elimination::EliminationEventType;
use crate::domain::elimination_classifier::{ClassifierBaselines, DurationDist, FeatureContext};
use crate::embedding::ServiceContext;
use crate::error::AppResult;
use crate::repo::elimination_records;
use chrono::{DateTime, Duration, NaiveDate, Timelike, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

const TRAINING_WINDOW_DAYS: i64 = 90;

#[derive(Debug, Clone)]
struct PriorRecord {
    event_type: EliminationEventType,
    occurred_at: DateTime<Utc>,
}

pub fn parse_occurred_at(occurred_at: &str) -> Option<DateTime<Utc>> {
    crate::record_time::parse_instant(occurred_at).ok()
}

fn window_start(at: DateTime<Utc>, hours: i64) -> DateTime<Utc> {
    at - Duration::hours(hours)
}

fn format_occurred_at(at: DateTime<Utc>) -> String {
    crate::record_time::format_utc(at)
}

fn minutes_between(earlier: DateTime<Utc>, later: DateTime<Utc>) -> f32 {
    later.signed_duration_since(earlier).num_seconds().max(0) as f32 / 60.0
}

fn percentile(sorted: &[i64], p: f64) -> f32 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() as f64 * p) as usize).min(sorted.len() - 1);
    sorted[idx] as f32
}

fn median(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        Some((sorted[mid - 1] + sorted[mid]) / 2.0)
    } else {
        Some(sorted[mid])
    }
}

fn std_dev(values: &[f64], mean: f64) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let var = values
        .iter()
        .map(|v| {
            let d = v - mean;
            d * d
        })
        .sum::<f64>()
        / values.len() as f64;
    var.sqrt()
}

pub(crate) async fn compute_baselines(
    pool: &SqlitePool,
    pet_id: Uuid,
    as_of: NaiveDate,
) -> AppResult<ClassifierBaselines> {
    let date_from = (as_of - Duration::days(TRAINING_WINDOW_DAYS)).to_string();
    let date_to = as_of.to_string();
    let summaries =
        elimination_records::classifier_daily_counts(pool, pet_id, &date_from, &date_to).await?;

    let mut wee_counts: Vec<i64> = summaries.iter().map(|s| s.0).collect();
    let mut poop_counts: Vec<i64> = summaries.iter().map(|s| s.1).collect();
    wee_counts.sort_unstable();
    poop_counts.sort_unstable();

    let labeled =
        elimination_records::labeled_training_records(pool, pet_id, &date_from, &date_to).await?;

    let mut wee_durations = Vec::new();
    let mut poop_durations = Vec::new();
    for row in &labeled {
        let Some(dur) = row.duration_seconds else {
            continue;
        };
        match row.event_type {
            EliminationEventType::Urination => wee_durations.push(dur as f64),
            EliminationEventType::Defecation => poop_durations.push(dur as f64),
            _ => {}
        }
    }

    let wee_duration = duration_dist(&wee_durations);
    let poop_duration = duration_dist(&poop_durations);

    Ok(ClassifierBaselines {
        p50_wees_per_day: percentile(&wee_counts, 0.5),
        p90_wees_per_day: percentile(&wee_counts, 0.9),
        p50_poops_per_day: percentile(&poop_counts, 0.5),
        p90_poops_per_day: percentile(&poop_counts, 0.9),
        wee_duration,
        poop_duration,
    })
}

fn duration_dist(values: &[f64]) -> Option<DurationDist> {
    if values.is_empty() {
        return None;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let med = median(values)? as f32;
    let std = std_dev(values, mean) as f32;
    Some(DurationDist {
        mean: mean as f32,
        std: std.max(1.0),
        median: med,
        n: values.len() as i32,
    })
}

fn build_from_prior(
    duration_seconds: i64,
    occurred_at: DateTime<Utc>,
    prior: &[PriorRecord],
    baselines: &ClassifierBaselines,
) -> FeatureContext {
    let start_24h = window_start(occurred_at, 24);
    let start_48h = window_start(occurred_at, 48);

    let mut wee_24h = 0;
    let mut poop_24h = 0;
    let mut wee_48h = 0;
    let mut poop_48h = 0;
    let mut last_wee: Option<DateTime<Utc>> = None;
    let mut last_poop: Option<DateTime<Utc>> = None;
    let mut last_any: Option<DateTime<Utc>> = None;

    for record in prior {
        let ts = record.occurred_at;
        if ts >= occurred_at {
            continue;
        }
        if ts >= start_48h {
            match record.event_type {
                EliminationEventType::Urination => wee_48h += 1,
                EliminationEventType::Defecation => poop_48h += 1,
                _ => {}
            }
        }
        if ts >= start_24h {
            match record.event_type {
                EliminationEventType::Urination => wee_24h += 1,
                EliminationEventType::Defecation => poop_24h += 1,
                _ => {}
            }
        }
        match record.event_type {
            EliminationEventType::Urination => last_wee = Some(record.occurred_at),
            EliminationEventType::Defecation => last_poop = Some(record.occurred_at),
            _ => {}
        }
        last_any = Some(record.occurred_at);
    }

    let hour_of_day = occurred_at.hour() as f32 + occurred_at.minute() as f32 / 60.0;

    FeatureContext {
        duration_seconds: duration_seconds as f64,
        wee_count_24h_before: wee_24h,
        poop_count_24h_before: poop_24h,
        wee_count_48h_before: wee_48h,
        poop_count_48h_before: poop_48h,
        minutes_since_last_wee: last_wee.map(|t| minutes_between(t, occurred_at)),
        minutes_since_last_poop: last_poop.map(|t| minutes_between(t, occurred_at)),
        minutes_since_last_any: last_any.map(|t| minutes_between(t, occurred_at)),
        hour_of_day,
        pet_p50_wees_per_day: baselines.p50_wees_per_day,
        pet_p90_wees_per_day: baselines.p90_wees_per_day,
        pet_p50_poops_per_day: baselines.p50_poops_per_day,
        pet_p90_poops_per_day: baselines.p90_poops_per_day,
        pet_median_wee_duration: baselines.wee_duration.as_ref().map(|d| d.median),
        pet_median_poop_duration: baselines.poop_duration.as_ref().map(|d| d.median),
        pet_std_wee_duration: baselines.wee_duration.as_ref().map(|d| d.std),
        pet_std_poop_duration: baselines.poop_duration.as_ref().map(|d| d.std),
    }
}

pub(crate) async fn build_feature_context(
    pool: &ServiceContext,
    pet_id: Uuid,
    occurred_at: &str,
    duration_seconds: i64,
) -> AppResult<FeatureContext> {
    let at = parse_occurred_at(occurred_at)
        .ok_or_else(|| crate::error::AppError::BadRequest("invalid occurred_at".to_string()))?;
    let as_of = at.date_naive();
    let baselines = compute_baselines(pool, pet_id, as_of).await?;

    let before = format_occurred_at(at);
    let fetch_from = format_occurred_at(window_start(at, 48));
    let rows = elimination_records::records_in_window(pool, pet_id, &before, &fetch_from).await?;
    let prior: Vec<PriorRecord> = rows
        .into_iter()
        .filter_map(|r| {
            let at = parse_occurred_at(&r.occurred_at)?;
            Some(PriorRecord {
                event_type: r.event_type,
                occurred_at: at,
            })
        })
        .collect();

    Ok(build_from_prior(duration_seconds, at, &prior, &baselines))
}

/// Build context for a training row using only records that occurred strictly before it.
pub(crate) async fn build_feature_context_for_training(
    pool: &ServiceContext,
    pet_id: Uuid,
    occurred_at: &str,
    duration_seconds: i64,
    baselines: &ClassifierBaselines,
) -> AppResult<FeatureContext> {
    let at = parse_occurred_at(occurred_at)
        .ok_or_else(|| crate::error::AppError::BadRequest("invalid occurred_at".to_string()))?;
    let before = format_occurred_at(at);
    let fetch_from = format_occurred_at(window_start(at, 48));
    let rows = elimination_records::records_in_window(pool, pet_id, &before, &fetch_from).await?;
    let prior: Vec<PriorRecord> = rows
        .into_iter()
        .filter_map(|r| {
            let ts = parse_occurred_at(&r.occurred_at)?;
            Some(PriorRecord {
                event_type: r.event_type,
                occurred_at: ts,
            })
        })
        .collect();
    Ok(build_from_prior(duration_seconds, at, &prior, baselines))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn baselines() -> ClassifierBaselines {
        ClassifierBaselines {
            p50_wees_per_day: 4.0,
            p90_wees_per_day: 6.0,
            p50_poops_per_day: 1.0,
            p90_poops_per_day: 2.0,
            wee_duration: Some(DurationDist {
                mean: 48.0,
                std: 10.0,
                median: 45.0,
                n: 10,
            }),
            poop_duration: Some(DurationDist {
                mean: 120.0,
                std: 15.0,
                median: 118.0,
                n: 10,
            }),
        }
    }

    #[test]
    fn rolling_24h_counts_ignore_midnight_boundary() {
        let at = parse_occurred_at("2026-06-02T01:00:00Z").unwrap();
        let prior = vec![
            PriorRecord {
                event_type: EliminationEventType::Defecation,
                occurred_at: parse_occurred_at("2026-06-01T23:00:00Z").unwrap(),
            },
            PriorRecord {
                event_type: EliminationEventType::Urination,
                occurred_at: parse_occurred_at("2026-06-02T00:30:00Z").unwrap(),
            },
        ];
        let ctx = build_from_prior(55, at, &prior, &baselines());
        assert_eq!(ctx.poop_count_24h_before, 1);
        assert_eq!(ctx.wee_count_24h_before, 1);
        assert_eq!(ctx.hour_of_day, 1.0);
    }

    #[test]
    fn repeated_dst_hour_uses_elapsed_time_and_utc_hour() {
        let at = parse_occurred_at("2026-10-25T02:35:00+01:00").unwrap();
        let prior = [PriorRecord {
            event_type: EliminationEventType::Urination,
            occurred_at: parse_occurred_at("2026-10-25T02:45:00+02:00").unwrap(),
        }];
        let ctx = build_from_prior(55, at, &prior, &baselines());
        assert_eq!(ctx.minutes_since_last_wee, Some(50.0));
        assert_eq!(ctx.wee_count_24h_before, 1);
        assert!((ctx.hour_of_day - (1.0 + 35.0 / 60.0)).abs() < 0.001);
    }

    #[tokio::test]
    async fn shared_model_features_and_training_days_are_independent_of_actor_timezone() {
        use crate::{domain::pet::Pet, repo::pets};
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::run_migrations(&db).await.unwrap();
        let pet = pets::create_pet(
            &db,
            Pet::new(serde_json::from_value(serde_json::json!({"name":"Shared"})).unwrap()),
        )
        .await
        .unwrap();
        // The explicit journal date must not move this sample's UTC training day.
        elimination_records::create(
            &db,
            serde_json::from_value(serde_json::json!({
                "pet_id":pet.id,"occurred_at":"2026-01-01T00:15:00Z",
                "local_date":"2025-12-31","event_type":"urination","duration_seconds":45
            }))
            .unwrap(),
            chrono_tz::UTC,
            false,
            None,
        )
        .await
        .unwrap();
        let mut east = ServiceContext::standalone(db.clone(), chrono_tz::Asia::Tokyo);
        east.actor.subject = "east".into();
        let mut west = ServiceContext::standalone(db, chrono_tz::America::Los_Angeles);
        west.actor.subject = "west".into();
        assert_ne!(
            east.timezone().await.unwrap(),
            west.timezone().await.unwrap()
        );
        let at = "2026-01-01T00:30:00Z";
        let first = build_feature_context(&east, pet.id, at, 50).await.unwrap();
        let second = build_feature_context(&west, pet.id, at, 50).await.unwrap();
        assert_eq!(first, second);
        assert_eq!(first.hour_of_day, 0.5);
        assert_eq!(first.minutes_since_last_wee, Some(15.0));
        let samples = elimination_records::labeled_training_records(
            &east,
            pet.id,
            "2026-01-01",
            "2026-01-01",
        )
        .await
        .unwrap();
        assert_eq!(samples.len(), 1);
        let baseline = compute_baselines(&east, pet.id, "2026-01-01".parse().unwrap())
            .await
            .unwrap();
        assert_eq!(baseline.p50_wees_per_day, 1.0);
        let training = build_feature_context_for_training(&west, pet.id, at, 50, &baseline)
            .await
            .unwrap();
        assert_eq!(first, training);
    }
}
