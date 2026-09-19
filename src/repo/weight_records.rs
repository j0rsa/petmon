use crate::domain::weight::{
    collect_tag_counts, normalize_weight_note, note_has_any_tag, parse_tag_filter,
    CreateWeightRecord, UpdateWeightRecord, WeightRecord, WeightRecordFilters, WeightStats,
    WeightTagCount,
};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use chrono_tz::Tz;
use sqlx::SqlitePool;
use uuid::Uuid;

pub const DEFAULT_RECENT_LIMIT: i64 = 10;

#[tracing::instrument(skip(pool, filters))]
pub async fn list(
    pool: &SqlitePool,
    filters: &WeightRecordFilters,
) -> AppResult<Vec<WeightRecord>> {
    list_scoped(pool, filters, &crate::embedding::PetVisibility::All).await
}

pub async fn list_scoped(
    pool: &SqlitePool,
    filters: &WeightRecordFilters,
    visibility: &crate::embedding::PetVisibility,
) -> AppResult<Vec<WeightRecord>> {
    let include = parse_tag_filter(filters.tags.as_deref());
    let has_date_range = filters.date_from.is_some() || filters.date_to.is_some();
    let page_limit = filters.limit.or(if has_date_range {
        None
    } else {
        Some(DEFAULT_RECENT_LIMIT)
    });

    let mut effective = filters.clone();
    if include.is_empty() {
        effective.limit = page_limit;
    } else {
        // Fetch the full candidate set, keep matching tags, then page.
        effective.limit = None;
        effective.offset = None;
    }

    let mut records = list_sql(pool, &effective, visibility).await?;
    if !include.is_empty() {
        records.retain(|record| note_has_any_tag(record.note.as_deref(), &include));
        let offset = filters.offset.unwrap_or(0).max(0) as usize;
        if offset > 0 {
            records = records.into_iter().skip(offset).collect();
        }
        if let Some(limit) = page_limit {
            records.truncate(limit.max(0) as usize);
        }
    }
    Ok(records)
}

async fn list_sql(
    pool: &SqlitePool,
    effective: &WeightRecordFilters,
    visibility: &crate::embedding::PetVisibility,
) -> AppResult<Vec<WeightRecord>> {
    let has_date_range = effective.date_from.is_some() || effective.date_to.is_some();
    let order_desc = !has_date_range;

    let mut query = String::from(
        "SELECT id, pet_id, measured_at, measured_at_utc, source_timezone, local_date, weight_kg, note, source_type, created_at FROM weight_records WHERE 1=1",
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
    query.push_str(&format!(" AND {}", visibility.predicate("pet_id")));
    query.push_str(if order_desc {
        " ORDER BY measured_at DESC"
    } else {
        " ORDER BY measured_at ASC"
    });
    if let Some(limit) = effective.limit {
        query.push_str(&format!(" LIMIT {}", limit.max(0)));
    }
    if let Some(offset) = effective.offset {
        query.push_str(&format!(" OFFSET {}", offset.max(0)));
    }

    let mut q = sqlx::query_as::<_, WeightRecord>(sqlx::AssertSqlSafe(query));
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

    Ok(q.fetch_all(pool).await?)
}

#[tracing::instrument(skip(pool))]
pub async fn list_tags(pool: &SqlitePool, pet_id: &str) -> AppResult<Vec<WeightTagCount>> {
    let pet_uuid = Uuid::parse_str(pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {pet_id}")))?;
    let notes: Vec<Option<String>> =
        sqlx::query_scalar("SELECT note FROM weight_records WHERE pet_id = ?")
            .bind(pet_uuid)
            .fetch_all(pool)
            .await?;
    Ok(collect_tag_counts(notes))
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<WeightRecord> {
    sqlx::query_as::<_, WeightRecord>(
        "SELECT id, pet_id, measured_at, measured_at_utc, source_timezone, local_date, weight_kg, note, source_type, created_at FROM weight_records WHERE id = ?",
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
    let time = crate::record_time::resolve(
        req.measured_at.as_deref(),
        req.local_date.as_deref(),
        timezone,
        Utc::now(),
    )?;
    let measured_at = time.civil;
    let local_date = time.local_date;
    let id = Uuid::new_v4().to_string();
    let source_type = req.source_type.unwrap_or_else(|| "manual".to_string());
    let pet_id = Uuid::parse_str(&req.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", req.pet_id)))?;
    let note = normalize_weight_note(req.note.as_deref());

    sqlx::query(
        "INSERT INTO weight_records (id, pet_id, measured_at, measured_at_utc, source_timezone, local_date, weight_kg, note, source_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&measured_at)
    .bind(&time.utc)
    .bind(&time.timezone)
    .bind(&local_date)
    .bind(req.weight_kg)
    .bind(&note)
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
        "SELECT id, pet_id, measured_at, measured_at_utc, source_timezone, local_date, weight_kg, note, source_type, created_at
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

#[tracing::instrument(skip(pool, req))]
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    req: UpdateWeightRecord,
) -> AppResult<WeightRecord> {
    let mut record = get(pool, id).await?;
    if let Some(note) = req.note {
        record.note = Some(normalize_weight_note(note.as_deref()));
        sqlx::query("UPDATE weight_records SET note=? WHERE id=?")
            .bind(&record.note)
            .bind(id)
            .execute(pool)
            .await?;
    }
    get(pool, id).await
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
            "SELECT measured_at AS bucket, CAST(NULL AS TEXT) AS tag, weight_kg AS avg_kg, weight_kg AS min_kg, weight_kg AS max_kg, CAST(1 AS INTEGER) AS count \
             FROM weight_records WHERE {conditions} ORDER BY measured_at ASC"
        ),
        WeightGranularity::Daily => format!(
            "SELECT local_date AS bucket, CAST(NULL AS TEXT) AS tag, AVG(weight_kg) AS avg_kg, MIN(weight_kg) AS min_kg, MAX(weight_kg) AS max_kg, CAST(COUNT(*) AS INTEGER) AS count \
             FROM weight_records WHERE {conditions} GROUP BY local_date ORDER BY bucket ASC"
        ),
        WeightGranularity::Weekly => format!(
            "SELECT DATE(local_date, '-' || CAST(((CAST(strftime('%w', local_date) AS INTEGER) + 6) % 7) AS TEXT) || ' days') AS bucket, \
             CAST(NULL AS TEXT) AS tag, AVG(weight_kg) AS avg_kg, MIN(weight_kg) AS min_kg, MAX(weight_kg) AS max_kg, CAST(COUNT(*) AS INTEGER) AS count \
             FROM weight_records WHERE {conditions} GROUP BY 1 ORDER BY 1 ASC"
        ),
        WeightGranularity::Monthly => format!(
            "SELECT date(local_date, 'start of month') AS bucket, \
             CAST(NULL AS TEXT) AS tag, AVG(weight_kg) AS avg_kg, MIN(weight_kg) AS min_kg, MAX(weight_kg) AS max_kg, CAST(COUNT(*) AS INTEGER) AS count \
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
