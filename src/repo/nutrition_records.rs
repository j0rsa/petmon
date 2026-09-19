use crate::domain::nutrition_record::{
    NutritionRecord, NutritionRecordFilters, UpdateNutritionRecord,
};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;

const RECORD_SELECT: &str = "SELECT id, pet_id, occurred_at, local_date, category, amount, unit, note, source_type, telegram_message_id, telegram_chat_id, telegram_thread_id, telegram_bot_id, created_at, updated_at FROM nutrition_records";

#[tracing::instrument(skip(pool, filters))]
pub async fn list_records(
    pool: &SqlitePool,
    filters: &NutritionRecordFilters,
) -> AppResult<Vec<NutritionRecord>> {
    list_records_scoped(pool, filters, &crate::embedding::PetVisibility::All).await
}

pub async fn list_records_scoped(
    pool: &SqlitePool,
    filters: &NutritionRecordFilters,
    visibility: &crate::embedding::PetVisibility,
) -> AppResult<Vec<NutritionRecord>> {
    let mut query = format!("{RECORD_SELECT} WHERE 1=1");

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
    if filters.category.is_some() {
        query.push_str(" AND category = ?");
    }
    query.push_str(&format!(" AND {}", visibility.predicate("pet_id")));
    query.push_str(" ORDER BY occurred_at ASC");
    if let Some(limit) = filters.limit {
        query.push_str(&format!(" LIMIT {}", limit.max(0)));
    }
    if let Some(offset) = filters.offset {
        query.push_str(&format!(" OFFSET {}", offset.max(0)));
    }

    let mut q = sqlx::query_as::<_, NutritionRecord>(sqlx::AssertSqlSafe(query));
    if let Some(pet_id) = filters.pet_id {
        q = q.bind(pet_id);
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
    if let Some(category) = &filters.category {
        q = q.bind(category);
    }

    Ok(q.fetch_all(pool).await?)
}

#[tracing::instrument(skip(pool))]
pub async fn get_record(pool: &SqlitePool, id: &str) -> AppResult<NutritionRecord> {
    let query = format!("{RECORD_SELECT} WHERE id = ?");
    sqlx::query_as::<_, NutritionRecord>(sqlx::AssertSqlSafe(query))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Nutrition record {id} not found")))
}

#[tracing::instrument(skip(pool, record), fields(id = %record.id, pet_id = %record.pet_id, category = %record.category))]
pub async fn create_record(
    pool: &SqlitePool,
    mut record: NutritionRecord,
) -> AppResult<NutritionRecord> {
    record.occurred_at =
        crate::record_time::format_utc(crate::record_time::parse_instant(&record.occurred_at)?);
    sqlx::query(
        "INSERT INTO nutrition_records (id, pet_id, occurred_at, local_date, category, amount, unit, note, source_type, telegram_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&record.id)
    .bind(record.pet_id)
    .bind(&record.occurred_at)
    .bind(&record.local_date)
    .bind(record.category)
    .bind(record.amount)
    .bind(&record.unit)
    .bind(&record.note)
    .bind(&record.source_type)
    .bind(record.telegram_message_id)
    .bind(&record.created_at)
    .bind(&record.updated_at)
    .execute(pool)
    .await?;
    get_record(pool, &record.id).await
}

#[tracing::instrument(skip(pool, req))]
pub async fn update_record(
    pool: &SqlitePool,
    id: &str,
    req: UpdateNutritionRecord,
    timezone: chrono_tz::Tz,
) -> AppResult<NutritionRecord> {
    let mut record = get_record(pool, id).await?;
    let now = Utc::now().to_rfc3339();
    if let Some(occurred_at) = req.occurred_at {
        let time = crate::record_time::resolve(
            Some(&occurred_at),
            req.local_date.as_deref(),
            timezone,
            Utc::now(),
        )?;
        record.occurred_at = time.utc;
    }
    if let Some(local_date) = req.local_date {
        record.local_date = local_date;
    }
    if let Some(category) = req.category {
        record.category = category;
    }
    if let Some(amount) = req.amount {
        record.amount = amount;
    }
    if req.unit.is_some() {
        record.unit = req.unit;
    }
    if let Some(note) = req.note {
        record.note = note;
    }
    record.updated_at = now;
    sqlx::query(
        "UPDATE nutrition_records SET occurred_at=?, local_date=?, category=?, amount=?, unit=?, note=?, updated_at=? WHERE id=?",
    )
    .bind(&record.occurred_at)
    .bind(&record.local_date)
    .bind(record.category)
    .bind(record.amount)
    .bind(&record.unit)
    .bind(&record.note)
    .bind(&record.updated_at)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(record)
}

#[tracing::instrument(skip(pool))]
pub async fn set_telegram_delivery(
    pool: &SqlitePool,
    id: &str,
    message_id: i64,
    chat_id: &str,
    thread_id: Option<&str>,
    bot_id: &str,
) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let rows =
        sqlx::query("UPDATE nutrition_records SET telegram_message_id=?, telegram_chat_id=?, telegram_thread_id=?, telegram_bot_id=?, updated_at=? WHERE id=?")
            .bind(message_id)
            .bind(chat_id)
            .bind(thread_id)
            .bind(bot_id)
            .bind(&now)
            .bind(id)
            .execute(pool)
            .await?
            .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!(
            "Nutrition record {id} not found"
        )));
    }
    Ok(())
}

#[tracing::instrument(skip(pool))]
pub async fn delete_record(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let rows = sqlx::query("DELETE FROM nutrition_records WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!(
            "Nutrition record {id} not found"
        )));
    }
    Ok(())
}

#[tracing::instrument(skip(pool, records), fields(count = records.len()))]
pub async fn create_records_batch(
    pool: &SqlitePool,
    mut records: Vec<NutritionRecord>,
) -> AppResult<Vec<NutritionRecord>> {
    for record in &mut records {
        record.occurred_at =
            crate::record_time::format_utc(crate::record_time::parse_instant(&record.occurred_at)?);
    }
    let mut tx = pool.begin().await?;
    for record in &records {
        sqlx::query(
            "INSERT INTO nutrition_records (id, pet_id, occurred_at, local_date, category, amount, unit, note, source_type, telegram_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&record.id)
        .bind(record.pet_id)
        .bind(&record.occurred_at)
        .bind(&record.local_date)
        .bind(record.category)
        .bind(record.amount)
        .bind(&record.unit)
        .bind(&record.note)
        .bind(&record.source_type)
        .bind(record.telegram_message_id)
        .bind(&record.created_at)
        .bind(&record.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(records)
}
