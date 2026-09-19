//! One canonical UTC instant per record. Journal days retain independent civil semantics.
use crate::error::{AppError, AppResult};
use chrono::{DateTime, LocalResult, NaiveDate, NaiveDateTime, SecondsFormat, TimeZone, Utc};
use chrono_tz::Tz;
use serde::Serialize;
use sqlx::{Row, SqlitePool};

pub struct RecordTime {
    pub utc: String,
    pub local_date: String,
}

/// Fixed precision makes SQLite TEXT ordering agree with instant ordering.
pub fn format_utc(instant: DateTime<Utc>) -> String {
    instant.to_rfc3339_opts(SecondsFormat::Nanos, true)
}
pub fn parse_instant(raw: &str) -> AppResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .map_err(|_| {
            AppError::BadRequest(
                "timestamp must be RFC3339 with an explicit UTC offset or Z".into(),
            )
        })
}
pub fn local_datetime(raw: &str, timezone: Tz) -> AppResult<DateTime<Tz>> {
    Ok(parse_instant(raw)?.with_timezone(&timezone))
}

pub fn resolve(
    raw: Option<&str>,
    local_date: Option<&str>,
    timezone: Tz,
    now: DateTime<Utc>,
) -> AppResult<RecordTime> {
    let journal_date = local_date
        .map(|date| {
            NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map_err(|_| AppError::BadRequest("invalid local_date".into()))
        })
        .transpose()?;
    let instant = if let Some(raw) = raw {
        parse_instant(raw)?
    } else if let Some(date) = journal_date {
        let local = now.with_timezone(&timezone);
        if date == local.date_naive() {
            now
        } else {
            local_to_utc(date.and_time(local.time()), timezone)?
        }
    } else {
        now
    };
    Ok(RecordTime {
        utc: format_utc(instant),
        local_date: local_date
            .map(str::to_owned)
            .unwrap_or_else(|| instant.with_timezone(&timezone).date_naive().to_string()),
    })
}

fn local_to_utc(civil: NaiveDateTime, timezone: Tz) -> AppResult<DateTime<Utc>> {
    match timezone.from_local_datetime(&civil) {
        LocalResult::Single(timestamp) => Ok(timestamp.with_timezone(&Utc)),
        LocalResult::Ambiguous(_, _) => Err(AppError::BadRequest("ambiguous local timestamp at daylight-saving transition; supply an explicit UTC offset".into())),
        LocalResult::None => Err(AppError::BadRequest("local timestamp does not exist at daylight-saving transition; supply a valid timestamp with explicit UTC offset".into())),
    }
}

const RECORD_COLUMNS: [(&str, &str); 5] = [
    ("nutrition_records", "occurred_at"),
    ("elimination_records", "occurred_at"),
    ("med_intake_records", "occurred_at"),
    ("health_records", "occurred_at"),
    ("weight_records", "measured_at"),
];

/// Startup must call this after schema migrations and before exposing care data.
pub async fn ensure_canonical(pool: &SqlitePool) -> AppResult<()> {
    for (table, field) in RECORD_COLUMNS {
        let query = format!("SELECT id, {field} AS instant FROM {table}");
        let mut rows = sqlx::query(sqlx::AssertSqlSafe(query)).fetch(pool);
        use futures::TryStreamExt;
        while let Some(row) = rows.try_next().await? {
            let raw: String = row.try_get("instant")?;
            if !parse_instant(&raw).is_ok_and(|dt| format_utc(dt) == raw) {
                return Err(AppError::Internal(format!("{table} contains legacy timestamps; stop the service and run petmon migrate-record-times --timezone <historical-IANA-zone> (dry run), resolve reported issues, then repeat with --apply")));
            }
        }
    }
    Ok(())
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

/// Explicit offline upgrade. The supplied historical zone is used only for legacy
/// naive values; offset inputs normalize directly. Journal days are untouched.
/// One unresolved row rolls back all updates. A write lock covers scan and updates.
pub async fn backfill_legacy(
    pool: &SqlitePool,
    historical_timezone: Tz,
    apply: bool,
) -> AppResult<BackfillReport> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let mut report = BackfillReport {
        candidates: 0,
        applied: false,
        issues: vec![],
    };
    for (table, field) in RECORD_COLUMNS {
        let query = format!("SELECT id, {field} AS instant FROM {table}");
        let rows = sqlx::query(sqlx::AssertSqlSafe(query))
            .fetch_all(&mut *tx)
            .await?;
        for row in rows {
            let id: String = row.try_get("id")?;
            let raw: String = row.try_get("instant")?;
            if parse_instant(&raw).is_ok_and(|dt| format_utc(dt) == raw) {
                continue;
            }
            report.candidates += 1;
            let resolved = match parse_instant(&raw) {
                Ok(instant) => Ok(instant),
                Err(_) => NaiveDateTime::parse_from_str(&raw, "%Y-%m-%dT%H:%M:%S%.f")
                    .map_err(|_| AppError::BadRequest("legacy timestamp is empty or invalid; supply its historical instant explicitly".into()))
                    .and_then(|civil| local_to_utc(civil, historical_timezone)),
            };
            match resolved {
                Ok(instant) if apply => {
                    let query = format!("UPDATE {table} SET {field}=? WHERE id=?");
                    sqlx::query(sqlx::AssertSqlSafe(query))
                        .bind(format_utc(instant))
                        .bind(id)
                        .execute(&mut *tx)
                        .await?;
                }
                Ok(_) => (),
                Err(error) => report.issues.push(BackfillIssue {
                    table: table.into(),
                    id,
                    reason: error.to_string(),
                }),
            }
        }
    }
    if apply && report.issues.is_empty() {
        if report.candidates > 0 {
            sqlx::query("UPDATE elimination_classifiers SET model_version=0, pending_retrain=1")
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

pub async fn run_cli(pool: &SqlitePool, args: &[String]) -> AppResult<bool> {
    if args.first().map(String::as_str) != Some("migrate-record-times") {
        return Ok(false);
    }
    let mut timezone = None;
    let mut apply = false;
    let mut args = args.iter().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--timezone" if timezone.is_none() => {
                timezone = Some(
                    args.next()
                        .ok_or_else(|| {
                            AppError::BadRequest("--timezone requires an IANA zone".into())
                        })?
                        .parse::<Tz>()
                        .map_err(|_| {
                            AppError::BadRequest("invalid historical IANA timezone".into())
                        })?,
                );
            }
            "--apply" if !apply => apply = true,
            _ => return Err(AppError::BadRequest(
                "usage: petmon migrate-record-times --timezone <historical-IANA-zone> [--apply]"
                    .into(),
            )),
        }
    }
    let timezone = timezone.ok_or_else(|| {
        AppError::BadRequest(
            "an explicit historical --timezone is required; current TIMEZONE is never assumed"
                .into(),
        )
    })?;
    let report = backfill_legacy(pool, timezone, apply).await?;
    println!(
        "{}",
        serde_json::to_string_pretty(&report)
            .map_err(|error| AppError::Internal(error.to_string()))?
    );
    if !report.issues.is_empty() {
        return Err(AppError::BadRequest(
            "legacy conversion has unresolved timestamps; no changes were committed".into(),
        ));
    }
    Ok(true)
}
