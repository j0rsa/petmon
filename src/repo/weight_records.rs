use crate::domain::weight::{CreateWeightRecord, WeightRecord, WeightRecordFilters};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

#[tracing::instrument(skip(pool, filters))]
pub async fn list(
    pool: &SqlitePool,
    filters: &WeightRecordFilters,
) -> AppResult<Vec<WeightRecord>> {
    let mut query = String::from(
        "SELECT id, pet_id, measured_at, local_date, weight_kg, note, source_type, created_at FROM weight_records WHERE 1=1",
    );

    if filters.pet_id.is_some() {
        query.push_str(" AND pet_id = ?");
    }
    if filters.date_from.is_some() {
        query.push_str(" AND local_date >= ?");
    }
    if filters.date_to.is_some() {
        query.push_str(" AND local_date <= ?");
    }
    query.push_str(" ORDER BY measured_at ASC");
    if let Some(limit) = filters.limit {
        query.push_str(&format!(" LIMIT {}", limit.max(0)));
    }
    if let Some(offset) = filters.offset {
        query.push_str(&format!(" OFFSET {}", offset.max(0)));
    }

    let mut q = sqlx::query_as::<_, WeightRecord>(sqlx::AssertSqlSafe(query));
    if let Some(pet_id_str) = &filters.pet_id {
        if let Ok(uuid) = Uuid::parse_str(pet_id_str) {
            q = q.bind(uuid);
        } else {
            q = q.bind(pet_id_str);
        }
    }
    if let Some(from) = &filters.date_from {
        q = q.bind(from);
    }
    if let Some(to) = &filters.date_to {
        q = q.bind(to);
    }

    Ok(q.fetch_all(pool).await?)
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<WeightRecord> {
    sqlx::query_as::<_, WeightRecord>(
        "SELECT id, pet_id, measured_at, local_date, weight_kg, note, source_type, created_at FROM weight_records WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Weight record {id} not found")))
}

#[tracing::instrument(skip(pool, req))]
pub async fn create(
    pool: &SqlitePool,
    req: CreateWeightRecord,
    timezone: Tz,
) -> AppResult<WeightRecord> {
    let now = Utc::now().to_rfc3339();
    let measured_at = req.measured_at.unwrap_or_else(|| {
        Utc::now()
            .with_timezone(&timezone)
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    });
    let local_date = req
        .local_date
        .unwrap_or_else(|| measured_at.split('T').next().unwrap_or("").to_string());
    let id = Uuid::new_v4().to_string();
    let source_type = req.source_type.unwrap_or_else(|| "manual".to_string());
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;

    sqlx::query(
        "INSERT INTO weight_records (id, pet_id, measured_at, local_date, weight_kg, note, source_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&measured_at)
    .bind(&local_date)
    .bind(req.weight_kg)
    .bind(&req.note)
    .bind(&source_type)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let rows = sqlx::query("DELETE FROM weight_records WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("Weight record {id} not found")));
    }
    Ok(())
}
