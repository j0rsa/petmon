use crate::domain::entry::{Entry, EntryFilters, UpdateEntry};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn list_entries(pool: &SqlitePool, filters: &EntryFilters) -> AppResult<Vec<Entry>> {
    let mut query = String::from(
        "SELECT id, cat_id, occurred_at, local_date, category, amount, unit, note, source_type, import_batch_id, created_at, updated_at FROM entries WHERE 1=1",
    );
    let mut args: Vec<String> = Vec::new();

    if let Some(cat_id) = &filters.cat_id {
        query.push_str(" AND cat_id = ?");
        args.push(cat_id.clone());
    }
    if let Some(date) = &filters.date {
        query.push_str(" AND local_date = ?");
        args.push(date.clone());
    }
    if let Some(from) = &filters.date_from {
        query.push_str(" AND local_date >= ?");
        args.push(from.clone());
    }
    if let Some(to) = &filters.date_to {
        query.push_str(" AND local_date <= ?");
        args.push(to.clone());
    }
    if let Some(category) = &filters.category {
        query.push_str(" AND category = ?");
        args.push(category.clone());
    }
    query.push_str(" ORDER BY occurred_at ASC");
    if let Some(limit) = filters.limit {
        query.push_str(&format!(" LIMIT {}", limit.max(0)));
    }
    if let Some(offset) = filters.offset {
        query.push_str(&format!(" OFFSET {}", offset.max(0)));
    }

    let mut q = sqlx::query_as::<_, Entry>(&query);
    for arg in &args {
        q = q.bind(arg);
    }
    let entries = q.fetch_all(pool).await?;
    Ok(entries)
}

pub async fn get_entry(pool: &SqlitePool, id: &str) -> AppResult<Entry> {
    let entry = sqlx::query_as::<_, Entry>(
        "SELECT id, cat_id, occurred_at, local_date, category, amount, unit, note, source_type, import_batch_id, created_at, updated_at FROM entries WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Entry {id} not found")))?;
    Ok(entry)
}

pub async fn create_entry(pool: &SqlitePool, entry: Entry) -> AppResult<Entry> {
    sqlx::query(
        "INSERT INTO entries (id, cat_id, occurred_at, local_date, category, amount, unit, note, source_type, import_batch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&entry.id)
    .bind(&entry.cat_id)
    .bind(&entry.occurred_at)
    .bind(&entry.local_date)
    .bind(&entry.category)
    .bind(entry.amount)
    .bind(&entry.unit)
    .bind(&entry.note)
    .bind(&entry.source_type)
    .bind(&entry.import_batch_id)
    .bind(&entry.created_at)
    .bind(&entry.updated_at)
    .execute(pool)
    .await?;
    get_entry(pool, &entry.id).await
}

pub async fn update_entry(pool: &SqlitePool, id: &str, req: UpdateEntry) -> AppResult<Entry> {
    let mut entry = get_entry(pool, id).await?;
    let now = Utc::now().to_rfc3339();
    if let Some(occurred_at) = req.occurred_at {
        entry.occurred_at = occurred_at;
    }
    if let Some(local_date) = req.local_date {
        entry.local_date = local_date;
    }
    if let Some(category) = req.category {
        entry.category = category;
    }
    if let Some(amount) = req.amount {
        entry.amount = amount;
    }
    if req.unit.is_some() {
        entry.unit = req.unit;
    }
    if req.note.is_some() {
        entry.note = req.note;
    }
    entry.updated_at = now;
    sqlx::query("UPDATE entries SET occurred_at=?, local_date=?, category=?, amount=?, unit=?, note=?, updated_at=? WHERE id=?")
        .bind(&entry.occurred_at)
        .bind(&entry.local_date)
        .bind(&entry.category)
        .bind(entry.amount)
        .bind(&entry.unit)
        .bind(&entry.note)
        .bind(&entry.updated_at)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(entry)
}

pub async fn delete_entry(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let rows = sqlx::query("DELETE FROM entries WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("Entry {id} not found")));
    }
    Ok(())
}

pub async fn create_entries_batch(pool: &SqlitePool, entries: Vec<Entry>) -> AppResult<Vec<Entry>> {
    let mut tx = pool.begin().await?;
    let mut created = Vec::with_capacity(entries.len());
    for entry in entries {
        sqlx::query(
            "INSERT INTO entries (id, cat_id, occurred_at, local_date, category, amount, unit, note, source_type, import_batch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&entry.id)
        .bind(&entry.cat_id)
        .bind(&entry.occurred_at)
        .bind(&entry.local_date)
        .bind(&entry.category)
        .bind(entry.amount)
        .bind(&entry.unit)
        .bind(&entry.note)
        .bind(&entry.source_type)
        .bind(&entry.import_batch_id)
        .bind(&entry.created_at)
        .bind(&entry.updated_at)
        .execute(&mut *tx)
        .await?;
        created.push(entry);
    }
    tx.commit().await?;
    Ok(created)
}
