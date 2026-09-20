//! One canonical UTC instant per record. Journal days retain independent civil semantics.
use crate::error::{AppError, AppResult};
use chrono::{DateTime, LocalResult, NaiveDate, NaiveDateTime, SecondsFormat, TimeZone, Utc};
use chrono_tz::Tz;

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
