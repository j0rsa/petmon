use crate::error::AppResult;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DayNote {
    pub id: String,
    pub cat_id: Option<String>,
    pub local_date: String,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn get_day_note(pool: &SqlitePool, local_date: &str, cat_id: Option<&str>) -> AppResult<Option<DayNote>> {
    let note = if let Some(cat_id) = cat_id {
        sqlx::query_as::<_, DayNote>(
            "SELECT id, cat_id, local_date, note, created_at, updated_at FROM day_notes WHERE local_date = ? AND cat_id = ?",
        )
        .bind(local_date)
        .bind(cat_id)
        .fetch_optional(pool)
        .await?
    } else {
        sqlx::query_as::<_, DayNote>(
            "SELECT id, cat_id, local_date, note, created_at, updated_at FROM day_notes WHERE local_date = ? AND cat_id IS NULL",
        )
        .bind(local_date)
        .fetch_optional(pool)
        .await?
    };
    Ok(note)
}

pub async fn upsert_day_note(pool: &SqlitePool, local_date: &str, cat_id: Option<&str>, note_text: &str) -> AppResult<DayNote> {
    let now = Utc::now().to_rfc3339();
    let existing = get_day_note(pool, local_date, cat_id).await?;
    if let Some(existing) = existing {
        sqlx::query("UPDATE day_notes SET note=?, updated_at=? WHERE id=?")
            .bind(note_text)
            .bind(&now)
            .bind(&existing.id)
            .execute(pool)
            .await?;
        return get_day_note(pool, local_date, cat_id).await.map(|n| n.expect("updated note"));
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO day_notes (id, cat_id, local_date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(cat_id)
    .bind(local_date)
    .bind(note_text)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;
    get_day_note(pool, local_date, cat_id).await.map(|n| n.expect("inserted note"))
}
