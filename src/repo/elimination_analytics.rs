use crate::domain::elimination::EliminationDailySummary;
use crate::error::AppResult;
use sqlx::SqlitePool;
use std::collections::BTreeMap;

#[derive(sqlx::FromRow)]
struct EventTypeCountRow {
    local_date: String,
    event_type: String,
    cnt: i64,
}

#[derive(sqlx::FromRow)]
struct AvgDurationByTypeRow {
    local_date: String,
    event_type: String,
    avg_duration: Option<f64>,
}

#[derive(Default, Clone, Copy)]
struct TypeAvgDurations {
    urination: Option<f64>,
    defecation: Option<f64>,
    general: Option<f64>,
}

#[tracing::instrument(skip(pool))]
pub async fn daily_summaries(
    pool: &SqlitePool,
    pet_id: Option<&str>,
    date_from: &str,
    date_to: &str,
) -> AppResult<Vec<EliminationDailySummary>> {
    let mut query = String::from(
        "SELECT local_date, event_type, COUNT(*) as cnt FROM elimination_records WHERE local_date BETWEEN ? AND ?",
    );
    if pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    query.push_str(" GROUP BY local_date, event_type ORDER BY local_date");

    let mut q = sqlx::query_as::<_, EventTypeCountRow>(sqlx::AssertSqlSafe(query))
        .bind(date_from)
        .bind(date_to);
    if let Some(pid) = pet_id {
        if let Ok(uuid) = uuid::Uuid::parse_str(pid) {
            q = q.bind(uuid);
        } else {
            q = q.bind(pid);
        }
    }

    let rows = q.fetch_all(pool).await?;

    // Avg duration per day and event type
    let mut type_dur_query = String::from(
        "SELECT local_date, event_type, AVG(duration_seconds) as avg_duration FROM elimination_records WHERE local_date BETWEEN ? AND ? AND duration_seconds IS NOT NULL",
    );
    if pet_id.is_some() {
        type_dur_query.push_str(" AND pet_id = ?");
    }
    type_dur_query.push_str(" GROUP BY local_date, event_type");

    let mut tq = sqlx::query_as::<_, AvgDurationByTypeRow>(sqlx::AssertSqlSafe(type_dur_query))
        .bind(date_from)
        .bind(date_to);
    if let Some(pid) = pet_id {
        if let Ok(uuid) = uuid::Uuid::parse_str(pid) {
            tq = tq.bind(uuid);
        } else {
            tq = tq.bind(pid);
        }
    }
    let type_dur_rows = tq.fetch_all(pool).await?;
    let mut avg_duration_by_date_type: BTreeMap<String, TypeAvgDurations> = BTreeMap::new();
    for row in type_dur_rows {
        let entry = avg_duration_by_date_type.entry(row.local_date).or_default();
        match row.event_type.as_str() {
            "urination" => entry.urination = row.avg_duration,
            "defecation" => entry.defecation = row.avg_duration,
            "general" => entry.general = row.avg_duration,
            _ => {}
        }
    }

    // Aggregate event counts by date
    let mut by_date: BTreeMap<String, (i64, i64, i64, i64)> = BTreeMap::new();
    // (urination, defecation, vomit, general)
    for row in &rows {
        let entry = by_date
            .entry(row.local_date.clone())
            .or_insert((0, 0, 0, 0));
        match row.event_type.as_str() {
            "urination" => entry.0 += row.cnt,
            "defecation" => entry.1 += row.cnt,
            "vomit" => entry.2 += row.cnt,
            _ => entry.3 += row.cnt,
        }
    }

    let pet_id_owned = pet_id.map(str::to_owned);
    let summaries = by_date
        .into_iter()
        .map(|(local_date, (urination, defecation, vomit, general))| {
            let total_count = urination + defecation + vomit + general;
            let type_durations = avg_duration_by_date_type
                .get(&local_date)
                .copied()
                .unwrap_or_default();
            EliminationDailySummary {
                local_date,
                pet_id: pet_id_owned.clone(),
                total_count,
                urination_count: urination,
                defecation_count: defecation,
                vomit_count: vomit,
                general_count: general,
                has_vomit: vomit > 0,
                urination_avg_duration_seconds: type_durations.urination,
                defecation_avg_duration_seconds: type_durations.defecation,
                general_avg_duration_seconds: type_durations.general,
            }
        })
        .collect();

    Ok(summaries)
}
