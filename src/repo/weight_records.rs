use crate::domain::weight::{CreateWeightRecord, WeightRecord, WeightRecordFilters, WeightStats};
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
pub async fn stats(
    pool: &SqlitePool,
    pet_id: &str,
    date_from: &str,
    date_to: &str,
) -> AppResult<WeightStats> {
    let pet_uuid = Uuid::parse_str(pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {pet_id}")))?;

    // Latest record overall for this pet
    let latest = sqlx::query_as::<_, WeightRecord>(
        "SELECT id, pet_id, measured_at, local_date, weight_kg, note, source_type, created_at
         FROM weight_records WHERE pet_id = ? ORDER BY measured_at DESC LIMIT 1",
    )
    .bind(pet_uuid)
    .fetch_optional(pool)
    .await?;

    // Avg within the date window
    let avg: Option<f64> = sqlx::query_scalar(
        "SELECT AVG(weight_kg) FROM weight_records WHERE pet_id = ? AND local_date >= ? AND local_date <= ?",
    )
    .bind(pet_uuid)
    .bind(date_from)
    .bind(date_to)
    .fetch_one(pool)
    .await?;

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM weight_records WHERE pet_id = ? AND local_date >= ? AND local_date <= ?",
    )
    .bind(pet_uuid)
    .bind(date_from)
    .bind(date_to)
    .fetch_one(pool)
    .await?;

    Ok(WeightStats {
        latest_kg: latest.as_ref().map(|r| r.weight_kg),
        latest_date: latest.map(|r| r.local_date),
        avg_kg: avg,
        count,
    })
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

#[tracing::instrument(skip(pool))]
pub async fn summary(
    pool: &SqlitePool,
    pet_id: &str,
    date_from: Option<&str>,
    date_to: &str,
    granularity: &crate::domain::weight::WeightGranularity,
) -> AppResult<Vec<crate::domain::weight::WeightSummaryBucket>> {
    use crate::domain::weight::WeightGranularity;
    let pet_uuid = Uuid::parse_str(pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {pet_id}")))?;

    let mut conditions = String::from("pet_id = ? AND local_date <= ?");
    if date_from.is_some() {
        conditions.push_str(" AND local_date >= ?");
    }

    let sql = match granularity {
        WeightGranularity::Raw => format!(
            "SELECT measured_at AS bucket, weight_kg AS avg_kg, weight_kg AS min_kg, weight_kg AS max_kg, CAST(1 AS INTEGER) AS count \
             FROM weight_records WHERE {conditions} ORDER BY measured_at ASC"
        ),
        WeightGranularity::Daily => format!(
            "SELECT local_date AS bucket, AVG(weight_kg) AS avg_kg, MIN(weight_kg) AS min_kg, MAX(weight_kg) AS max_kg, CAST(COUNT(*) AS INTEGER) AS count \
             FROM weight_records WHERE {conditions} GROUP BY local_date ORDER BY bucket ASC"
        ),
        WeightGranularity::Weekly => format!(
            "SELECT DATE(local_date, '-' || CAST(((CAST(strftime('%w', local_date) AS INTEGER) + 6) % 7) AS TEXT) || ' days') AS bucket, \
             AVG(weight_kg) AS avg_kg, MIN(weight_kg) AS min_kg, MAX(weight_kg) AS max_kg, CAST(COUNT(*) AS INTEGER) AS count \
             FROM weight_records WHERE {conditions} GROUP BY 1 ORDER BY 1 ASC"
        ),
    };

    let mut q =
        sqlx::query_as::<_, crate::domain::weight::WeightSummaryBucket>(sqlx::AssertSqlSafe(sql));
    q = q.bind(pet_uuid).bind(date_to);
    if let Some(from) = date_from {
        q = q.bind(from);
    }
    Ok(q.fetch_all(pool).await?)
}
