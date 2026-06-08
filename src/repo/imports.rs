use crate::domain::import::ImportBatch;
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn list_batches(pool: &SqlitePool) -> AppResult<Vec<ImportBatch>> {
    let batches = sqlx::query_as::<_, ImportBatch>(
        "SELECT id, source_name, raw_text, parse_summary_json, created_at, committed_at FROM import_batches ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(batches)
}

pub async fn get_batch(pool: &SqlitePool, id: &str) -> AppResult<ImportBatch> {
    let batch = sqlx::query_as::<_, ImportBatch>(
        "SELECT id, source_name, raw_text, parse_summary_json, created_at, committed_at FROM import_batches WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Import batch {id} not found")))?;
    Ok(batch)
}

pub async fn create_batch(pool: &SqlitePool, batch: ImportBatch) -> AppResult<ImportBatch> {
    sqlx::query(
        "INSERT INTO import_batches (id, source_name, raw_text, parse_summary_json, created_at, committed_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&batch.id)
    .bind(&batch.source_name)
    .bind(&batch.raw_text)
    .bind(&batch.parse_summary_json)
    .bind(&batch.created_at)
    .bind(&batch.committed_at)
    .execute(pool)
    .await?;
    get_batch(pool, &batch.id).await
}

pub async fn commit_batch(pool: &SqlitePool, id: &str) -> AppResult<ImportBatch> {
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE import_batches SET committed_at=? WHERE id=?")
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
    get_batch(pool, id).await
}
