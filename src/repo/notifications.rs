use crate::domain::notification::{CreateNotification, Notification};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;

#[derive(Debug, sqlx::FromRow)]
struct NotificationRow {
    id: String,
    kind: String,
    title: String,
    body: Option<String>,
    link_path: String,
    link_hash: Option<String>,
    pet_id: Option<uuid::Uuid>,
    pet_name: Option<String>,
    source_kind: Option<String>,
    source_id: Option<String>,
    created_at: String,
    read: i64,
}

fn map_row(row: NotificationRow) -> (Notification, bool) {
    (
        Notification {
            id: row.id,
            kind: row.kind,
            title: row.title,
            body: row.body,
            link_path: row.link_path,
            link_hash: row.link_hash,
            pet_id: row.pet_id,
            pet_name: row.pet_name,
            source_kind: row.source_kind,
            source_id: row.source_id,
            created_at: row.created_at,
        },
        row.read != 0,
    )
}

#[tracing::instrument(skip(pool, req))]
pub async fn create(pool: &SqlitePool, req: CreateNotification) -> AppResult<Option<Notification>> {
    let notification = req.into_row();
    let result = sqlx::query(
        "INSERT OR IGNORE INTO notifications (id, kind, title, body, link_path, link_hash, pet_id, pet_name, source_kind, source_id, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&notification.id)
    .bind(&notification.kind)
    .bind(&notification.title)
    .bind(&notification.body)
    .bind(&notification.link_path)
    .bind(&notification.link_hash)
    .bind(notification.pet_id)
    .bind(&notification.pet_name)
    .bind(&notification.source_kind)
    .bind(&notification.source_id)
    .bind(&notification.created_at)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Ok(None);
    }
    Ok(Some(notification))
}

#[tracing::instrument(skip(pool))]
pub async fn list_for_reader(
    pool: &SqlitePool,
    reader_key: &str,
    limit: i64,
    unread_only: bool,
) -> AppResult<Vec<(Notification, bool)>> {
    let limit = limit.clamp(1, 200);
    let query = if unread_only {
        "SELECT n.id, n.kind, n.title, n.body, n.link_path, n.link_hash, n.pet_id, n.pet_name, n.source_kind, n.source_id, n.created_at, \
                CASE WHEN r.read_at IS NULL THEN 0 ELSE 1 END AS read \
         FROM notifications n \
         LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.reader_key = ? \
         WHERE r.read_at IS NULL \
         ORDER BY n.created_at DESC \
         LIMIT ?"
    } else {
        "SELECT n.id, n.kind, n.title, n.body, n.link_path, n.link_hash, n.pet_id, n.pet_name, n.source_kind, n.source_id, n.created_at, \
                CASE WHEN r.read_at IS NULL THEN 0 ELSE 1 END AS read \
         FROM notifications n \
         LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.reader_key = ? \
         ORDER BY n.created_at DESC \
         LIMIT ?"
    };

    let rows = sqlx::query_as::<_, NotificationRow>(sqlx::AssertSqlSafe(query.to_string()))
        .bind(reader_key)
        .bind(limit)
        .fetch_all(pool)
        .await?;

    Ok(rows.into_iter().map(map_row).collect())
}

#[tracing::instrument(skip(pool))]
pub async fn unread_count(pool: &SqlitePool, reader_key: &str) -> AppResult<i64> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM notifications n \
         LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.reader_key = ? \
         WHERE r.read_at IS NULL",
    )
    .bind(reader_key)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

#[tracing::instrument(skip(pool))]
pub async fn mark_read(
    pool: &SqlitePool,
    notification_id: &str,
    reader_key: &str,
) -> AppResult<()> {
    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM notifications WHERE id = ?")
        .bind(notification_id)
        .fetch_optional(pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound(format!(
            "Notification {notification_id} not found"
        )));
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO notification_reads (notification_id, reader_key, read_at) VALUES (?, ?, ?) \
         ON CONFLICT(notification_id, reader_key) DO UPDATE SET read_at = excluded.read_at",
    )
    .bind(notification_id)
    .bind(reader_key)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

#[tracing::instrument(skip(pool))]
pub async fn mark_all_read(pool: &SqlitePool, reader_key: &str) -> AppResult<i64> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        "INSERT INTO notification_reads (notification_id, reader_key, read_at) \
         SELECT n.id, ?, ? FROM notifications n \
         LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.reader_key = ? \
         WHERE r.read_at IS NULL",
    )
    .bind(reader_key)
    .bind(&now)
    .bind(reader_key)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() as i64)
}
