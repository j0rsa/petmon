use crate::domain::elimination::EliminationEventType;
use crate::domain::elimination_classifier::{ClassifierBaselines, DurationDist, FeatureContext};
use crate::error::AppResult;
use crate::repo::{elimination_analytics, elimination_records};
use chrono::{Duration, NaiveDate, NaiveDateTime, Timelike};
use sqlx::SqlitePool;
use uuid::Uuid;

const TRAINING_WINDOW_DAYS: i64 = 90;

#[derive(Debug, Clone)]
struct PriorRecord {
    event_type: EliminationEventType,
    occurred_at: NaiveDateTime,
}

pub fn parse_occurred_at(occurred_at: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(occurred_at, "%Y-%m-%dT%H:%M:%S").ok()
}

fn window_start(at: NaiveDateTime, hours: i64) -> NaiveDateTime {
    at - Duration::hours(hours)
}

fn format_occurred_at(at: NaiveDateTime) -> String {
    at.format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn minutes_between(earlier: NaiveDateTime, later: NaiveDateTime) -> f32 {
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

pub async fn compute_baselines(
    pool: &SqlitePool,
    pet_id: Uuid,
    as_of: NaiveDate,
) -> AppResult<ClassifierBaselines> {
    let date_from = (as_of - Duration::days(TRAINING_WINDOW_DAYS)).to_string();
    let date_to = as_of.to_string();
    let pet_id_str = pet_id.to_string();
    let summaries =
        elimination_analytics::daily_summaries(pool, Some(&pet_id_str), &date_from, &date_to)
            .await?;

    let mut wee_counts: Vec<i64> = summaries.iter().map(|s| s.urination_count).collect();
    let mut poop_counts: Vec<i64> = summaries.iter().map(|s| s.defecation_count).collect();
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
    occurred_at: NaiveDateTime,
    prior: &[PriorRecord],
    baselines: &ClassifierBaselines,
) -> FeatureContext {
    let at_str = format_occurred_at(occurred_at);
    let start_24h = format_occurred_at(window_start(occurred_at, 24));
    let start_48h = format_occurred_at(window_start(occurred_at, 48));

    let mut wee_24h = 0;
    let mut poop_24h = 0;
    let mut wee_48h = 0;
    let mut poop_48h = 0;
    let mut last_wee: Option<NaiveDateTime> = None;
    let mut last_poop: Option<NaiveDateTime> = None;
    let mut last_any: Option<NaiveDateTime> = None;

    for record in prior {
        let ts = record.occurred_at.format("%Y-%m-%dT%H:%M:%S").to_string();
        if ts >= at_str {
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

pub async fn build_feature_context(
    pool: &SqlitePool,
    pet_id: Uuid,
    occurred_at: &str,
    duration_seconds: i64,
) -> AppResult<FeatureContext> {
    let at = parse_occurred_at(occurred_at)
        .ok_or_else(|| crate::error::AppError::BadRequest("invalid occurred_at".to_string()))?;
    let as_of = at.date();
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
pub async fn build_feature_context_for_training(
    pool: &SqlitePool,
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
        let at = NaiveDateTime::parse_from_str("2026-06-02T01:00:00", "%Y-%m-%dT%H:%M:%S").unwrap();
        let prior = vec![
            PriorRecord {
                event_type: EliminationEventType::Defecation,
                occurred_at: NaiveDateTime::parse_from_str(
                    "2026-06-01T23:00:00",
                    "%Y-%m-%dT%H:%M:%S",
                )
                .unwrap(),
            },
            PriorRecord {
                event_type: EliminationEventType::Urination,
                occurred_at: NaiveDateTime::parse_from_str(
                    "2026-06-02T00:30:00",
                    "%Y-%m-%dT%H:%M:%S",
                )
                .unwrap(),
            },
        ];
        let ctx = build_from_prior(55, at, &prior, &baselines());
        assert_eq!(ctx.poop_count_24h_before, 1);
        assert_eq!(ctx.wee_count_24h_before, 1);
    }
}
