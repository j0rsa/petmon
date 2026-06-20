use crate::domain::elimination::{
    EliminationRecord, EliminationRecordFilters, UpdateEliminationRecord,
};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

#[tracing::instrument(skip(pool, filters))]
pub async fn list(
    pool: &SqlitePool,
    filters: &EliminationRecordFilters,
) -> AppResult<Vec<EliminationRecord>> {
    let mut query = String::from(
        "SELECT id, pet_id, occurred_at, local_date, event_type, subtype, duration_seconds, note, source_type, created_at, updated_at FROM elimination_records WHERE 1=1",
    );

    if filters.pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    if filters.date.is_some() {
        query.push_str(" AND local_date = ?");
    }
    if filters.date_from.is_some() {
        query.push_str(" AND local_date >= ?");
    }
    if filters.date_to.is_some() {
        query.push_str(" AND local_date <= ?");
    }
    if filters.event_type.is_some() {
        query.push_str(" AND event_type = ?");
    }
    query.push_str(" ORDER BY occurred_at ASC");
    if let Some(limit) = filters.limit {
        query.push_str(&format!(" LIMIT {}", limit.max(0)));
    }
    if let Some(offset) = filters.offset {
        query.push_str(&format!(" OFFSET {}", offset.max(0)));
    }

    let mut q = sqlx::query_as::<_, EliminationRecord>(sqlx::AssertSqlSafe(query));
    if let Some(pet_id_str) = &filters.pet_id {
        if let Ok(uuid) = Uuid::parse_str(pet_id_str) {
            q = q.bind(uuid);
        } else {
            q = q.bind(pet_id_str);
        }
    }
    if let Some(date) = &filters.date {
        q = q.bind(date);
    }
    if let Some(from) = &filters.date_from {
        q = q.bind(from);
    }
    if let Some(to) = &filters.date_to {
        q = q.bind(to);
    }
    if let Some(event_type) = &filters.event_type {
        q = q.bind(event_type);
    }

    Ok(q.fetch_all(pool).await?)
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<EliminationRecord> {
    sqlx::query_as::<_, EliminationRecord>(
        "SELECT id, pet_id, occurred_at, local_date, event_type, subtype, duration_seconds, note, source_type, created_at, updated_at FROM elimination_records WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Elimination record {id} not found")))
}

#[tracing::instrument(skip(pool, req))]
pub async fn create(
    pool: &SqlitePool,
    req: crate::domain::elimination::CreateEliminationRecord,
    timezone: Tz,
) -> AppResult<EliminationRecord> {
    let now = Utc::now().to_rfc3339();
    let occurred_at = req.occurred_at.unwrap_or_else(|| {
        Utc::now()
            .with_timezone(&timezone)
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    });
    let local_date = req
        .local_date
        .unwrap_or_else(|| occurred_at.split('T').next().unwrap_or("").to_string());
    let id = Uuid::new_v4().to_string();
    let source_type = req.source_type.unwrap_or_else(|| "manual".to_string());
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;

    sqlx::query(
        "INSERT INTO elimination_records (id, pet_id, occurred_at, local_date, event_type, subtype, duration_seconds, note, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&occurred_at)
    .bind(&local_date)
    .bind(req.event_type)
    .bind(&req.subtype)
    .bind(req.duration_seconds)
    .bind(&req.note)
    .bind(&source_type)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

#[tracing::instrument(skip(pool, req))]
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    req: UpdateEliminationRecord,
) -> AppResult<EliminationRecord> {
    let mut record = get(pool, id).await?;
    let now = Utc::now().to_rfc3339();

    if let Some(occurred_at) = req.occurred_at {
        record.occurred_at = occurred_at;
    }
    if let Some(local_date) = req.local_date {
        record.local_date = local_date;
    }
    if let Some(event_type) = req.event_type {
        record.event_type = event_type;
    }
    if let Some(subtype) = req.subtype {
        record.subtype = subtype;
    }
    if let Some(duration_seconds) = req.duration_seconds {
        record.duration_seconds = duration_seconds;
    }
    if let Some(note) = req.note {
        record.note = note;
    }
    record.updated_at = now;

    sqlx::query(
        "UPDATE elimination_records SET occurred_at=?, local_date=?, event_type=?, subtype=?, duration_seconds=?, note=?, updated_at=? WHERE id=?",
    )
    .bind(&record.occurred_at)
    .bind(&record.local_date)
    .bind(record.event_type)
    .bind(&record.subtype)
    .bind(record.duration_seconds)
    .bind(&record.note)
    .bind(&record.updated_at)
    .bind(id)
    .execute(pool)
    .await?;

    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let rows = sqlx::query("DELETE FROM elimination_records WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!(
            "Elimination record {id} not found"
        )));
    }
    Ok(())
}
