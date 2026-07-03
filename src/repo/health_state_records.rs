use crate::domain::health_state::{
    CreateHealthStateRecord, HealthStatePayload, HealthStateRecord, HealthStateRecordFilters,
    RECORD_TYPE,
};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct HealthStateRow {
    id: String,
    pet_id: Uuid,
    occurred_at: String,
    local_date: String,
    note: Option<String>,
    payload_json: String,
    source_type: String,
    created_at: String,
}

fn row_to_record(row: HealthStateRow) -> AppResult<HealthStateRecord> {
    let payload: HealthStatePayload = serde_json::from_str(&row.payload_json).map_err(|err| {
        AppError::Internal(format!(
            "invalid health state payload for record {}: {err}",
            row.id
        ))
    })?;
    Ok(HealthStateRecord {
        id: row.id,
        pet_id: row.pet_id,
        occurred_at: row.occurred_at,
        local_date: row.local_date,
        level: payload.level,
        note: row.note,
        source_type: row.source_type,
        created_at: row.created_at,
    })
}

pub const DEFAULT_RECENT_LIMIT: i64 = 10;

#[tracing::instrument(skip(pool, filters))]
pub async fn list(
    pool: &SqlitePool,
    filters: &HealthStateRecordFilters,
) -> AppResult<Vec<HealthStateRecord>> {
    let has_date_range = filters.date_from.is_some() || filters.date_to.is_some();
    let limit = filters.limit.or_else(|| {
        if has_date_range {
            None
        } else {
            Some(DEFAULT_RECENT_LIMIT)
        }
    });
    let order_desc = !has_date_range;

    let mut effective = filters.clone();
    effective.limit = limit;

    let mut query = String::from(
        "SELECT id, pet_id, occurred_at, local_date, note, payload_json, source_type, created_at
         FROM health_records WHERE record_type = ?",
    );

    if effective.pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    if effective.date_from.is_some() {
        query.push_str(" AND local_date >= ?");
    }
    if effective.date_to.is_some() {
        query.push_str(" AND local_date <= ?");
    }
    query.push_str(if order_desc {
        " ORDER BY occurred_at DESC"
    } else {
        " ORDER BY occurred_at ASC"
    });
    if let Some(limit) = effective.limit {
        query.push_str(&format!(" LIMIT {}", limit.max(0)));
    }
    if let Some(offset) = effective.offset {
        query.push_str(&format!(" OFFSET {}", offset.max(0)));
    }

    let mut q = sqlx::query_as::<_, HealthStateRow>(sqlx::AssertSqlSafe(query)).bind(RECORD_TYPE);
    if let Some(pet_id_str) = &effective.pet_id {
        if let Ok(uuid) = Uuid::parse_str(pet_id_str) {
            q = q.bind(uuid);
        } else {
            q = q.bind(pet_id_str);
        }
    }
    if let Some(from) = &effective.date_from {
        q = q.bind(from);
    }
    if let Some(to) = &effective.date_to {
        q = q.bind(to);
    }

    let rows = q.fetch_all(pool).await?;
    rows.into_iter().map(row_to_record).collect()
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<HealthStateRecord> {
    let row = sqlx::query_as::<_, HealthStateRow>(
        "SELECT id, pet_id, occurred_at, local_date, note, payload_json, source_type, created_at
         FROM health_records WHERE id = ? AND record_type = ?",
    )
    .bind(id)
    .bind(RECORD_TYPE)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Health state record {id} not found")))?;

    row_to_record(row)
}

#[tracing::instrument(skip(pool, req))]
pub async fn create(
    pool: &SqlitePool,
    req: CreateHealthStateRecord,
    timezone: Tz,
) -> AppResult<HealthStateRecord> {
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
    let payload_json =
        serde_json::to_string(&HealthStatePayload { level: req.level }).map_err(|err| {
            AppError::Internal(format!("failed to encode health state payload: {err}"))
        })?;

    sqlx::query(
        "INSERT INTO health_records
         (id, pet_id, occurred_at, local_date, record_type, note, payload_json, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&occurred_at)
    .bind(&local_date)
    .bind(RECORD_TYPE)
    .bind(&req.note)
    .bind(&payload_json)
    .bind(&source_type)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM health_records WHERE id = ? AND record_type = ?")
        .bind(id)
        .bind(RECORD_TYPE)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "Health state record {id} not found"
        )));
    }
    Ok(())
}
