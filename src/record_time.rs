//! Canonical instants alongside the historical civil-time API snapshots.
use crate::error::{AppError, AppResult};
use chrono::{DateTime, LocalResult, NaiveDate, NaiveDateTime, SecondsFormat, TimeZone, Utc};
use chrono_tz::Tz;
use serde::Serialize;
use sqlx::{Row, SqlitePool};

pub struct RecordTime {
    pub civil: String,
    pub utc: String,
    pub local_date: String,
    pub timezone: String,
}

pub fn resolve(
    raw: Option<&str>,
    local_date: Option<&str>,
    timezone: Tz,
    now: DateTime<Utc>,
) -> AppResult<RecordTime> {
    let instant = if let Some(raw) = raw.filter(|s| !s.is_empty()) {
        if let Ok(timestamp) = DateTime::parse_from_rfc3339(raw) {
            timestamp.with_timezone(&Utc)
        } else {
            let civil =
                NaiveDateTime::parse_from_str(raw, "%Y-%m-%dT%H:%M:%S%.f").map_err(|_| {
                    AppError::BadRequest("timestamp must be RFC3339 or YYYY-MM-DDTHH:MM:SS".into())
                })?;
            local_to_utc(civil, timezone)?
        }
    } else if let Some(date) = local_date {
        let date = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| AppError::BadRequest("invalid local_date".into()))?;
        let local = now.with_timezone(&timezone);
        if date == local.date_naive() {
            now
        } else {
            local_to_utc(date.and_time(local.time()), timezone)?
        }
    } else {
        now
    };
    let local = instant.with_timezone(&timezone);
    if let Some(date) = local_date {
        NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| AppError::BadRequest("invalid local_date".into()))?;
    }
    Ok(RecordTime {
        civil: local.format("%Y-%m-%dT%H:%M:%S").to_string(),
        utc: instant.to_rfc3339_opts(SecondsFormat::AutoSi, true),
        local_date: local_date
            .map(str::to_owned)
            .unwrap_or_else(|| local.date_naive().to_string()),
        timezone: timezone.name().into(),
    })
}

fn local_to_utc(civil: NaiveDateTime, timezone: Tz) -> AppResult<DateTime<Utc>> {
    match timezone.from_local_datetime(&civil) {
        LocalResult::Single(timestamp) => Ok(timestamp.with_timezone(&Utc)),
        LocalResult::Ambiguous(_, _) => Err(AppError::BadRequest("ambiguous local timestamp at daylight-saving transition; supply an explicit UTC offset".into())),
        LocalResult::None => Err(AppError::BadRequest("local timestamp does not exist at daylight-saving transition; supply a valid timestamp with explicit UTC offset".into())),
    }
}

#[derive(Debug, Serialize)]
pub struct BackfillIssue {
    pub table: String,
    pub id: String,
    pub reason: String,
}
#[derive(Debug, Serialize)]
pub struct BackfillReport {
    pub candidates: usize,
    pub applied: bool,
    pub issues: Vec<BackfillIssue>,
}

/// Explicit operator migration. The caller must establish the historical zone;
/// current deployment/resource settings are never assumed. Dry-run by default
/// at the call site; apply is all-or-nothing if any legacy time is unresolved.
pub async fn backfill_legacy(
    pool: &SqlitePool,
    historical_timezone: Tz,
    apply: bool,
) -> AppResult<BackfillReport> {
    let mut tx = pool.begin().await?;
    let mut report = BackfillReport {
        candidates: 0,
        applied: false,
        issues: vec![],
    };
    let mut updates = vec![];
    for (table, field) in [
        ("nutrition_records", "occurred_at"),
        ("elimination_records", "occurred_at"),
        ("med_intake_records", "occurred_at"),
        ("health_records", "occurred_at"),
        ("weight_records", "measured_at"),
    ] {
        let query = format!(
            "SELECT id, {field} AS civil, local_date FROM {table} WHERE {field}_utc IS NULL"
        );
        let rows = sqlx::query(sqlx::AssertSqlSafe(query))
            .fetch_all(&mut *tx)
            .await?;
        for row in rows {
            let id: String = row.try_get("id")?;
            let civil: String = row.try_get("civil")?;
            let date: String = row.try_get("local_date")?;
            report.candidates += 1;
            let resolved = if civil.trim().is_empty() {
                Err(AppError::BadRequest(
                    "legacy timestamp is empty; an explicit historical instant is required".into(),
                ))
            } else {
                resolve(Some(&civil), Some(&date), historical_timezone, Utc::now())
            };
            match resolved {
                Ok(time) => updates.push((table, field, id, time.utc)),
                Err(error) => report.issues.push(BackfillIssue {
                    table: table.into(),
                    id,
                    reason: error.to_string(),
                }),
            }
        }
    }
    if apply && report.issues.is_empty() {
        for (table, field, id, utc) in updates {
            let query = format!("UPDATE {table} SET {field}_utc=?, source_timezone=? WHERE id=? AND {field}_utc IS NULL");
            sqlx::query(sqlx::AssertSqlSafe(query))
                .bind(utc)
                .bind(historical_timezone.name())
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        report.applied = true;
    } else {
        tx.rollback().await?;
    }
    Ok(report)
}
