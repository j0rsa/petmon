use crate::domain::elimination::EliminationRecord;
use crate::domain::notification::{
    CreateNotification, NotificationUnreadCount, NotificationView,
    KIND_ELIMINATION_AUTO_CATEGORIZE_FAILED,
};
use crate::error::AppResult;
use crate::repo::notifications;
use crate::services::elimination_auto_categorize::AutoCategorizeFailureReason;
use crate::services::push_service;
use sqlx::SqlitePool;

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &SqlitePool,
    reader_key: &str,
    limit: i64,
    unread_only: bool,
) -> AppResult<Vec<NotificationView>> {
    let rows = notifications::list_for_reader(pool, reader_key, limit, unread_only).await?;
    Ok(rows
        .into_iter()
        .map(|(n, read)| NotificationView::from_row(n, read))
        .collect())
}

#[tracing::instrument(skip(pool))]
pub async fn unread_count(
    pool: &SqlitePool,
    reader_key: &str,
) -> AppResult<NotificationUnreadCount> {
    let count = notifications::unread_count(pool, reader_key).await?;
    Ok(NotificationUnreadCount { count })
}

#[tracing::instrument(skip(pool))]
pub async fn mark_read(
    pool: &SqlitePool,
    notification_id: &str,
    reader_key: &str,
) -> AppResult<()> {
    notifications::mark_read(pool, notification_id, reader_key).await
}

#[tracing::instrument(skip(pool))]
pub async fn mark_all_read(
    pool: &SqlitePool,
    reader_key: &str,
) -> AppResult<NotificationUnreadCount> {
    notifications::mark_all_read(pool, reader_key).await?;
    unread_count(pool, reader_key).await
}

#[tracing::instrument(skip(pool))]
pub async fn notify_elimination_auto_categorize_failed(
    pool: &SqlitePool,
    record: &EliminationRecord,
    pet_name: &str,
    reason: AutoCategorizeFailureReason,
) -> AppResult<()> {
    let (title, body) = failure_copy(pet_name, record.local_date.as_str(), reason);
    let link_path = format!("/elimination/{}", record.local_date);

    let created = notifications::create(
        pool,
        CreateNotification {
            kind: KIND_ELIMINATION_AUTO_CATEGORIZE_FAILED.to_string(),
            title,
            body: Some(body),
            link_path,
            link_hash: Some(format!("record-{}", record.id)),
            pet_id: Some(record.pet_id),
            pet_name: Some(pet_name.to_string()),
            source_kind: Some("elimination_record".to_string()),
            source_id: Some(record.id.clone()),
        },
    )
    .await?;

    if let Some(notification) = created {
        push_service::spawn_broadcast(pool.clone(), notification);
    }
    Ok(())
}

fn failure_copy(
    pet_name: &str,
    local_date: &str,
    reason: AutoCategorizeFailureReason,
) -> (String, String) {
    match reason {
        AutoCategorizeFailureReason::InsufficientHistory => (
            format!("Could not auto-tag {pet_name}'s visit"),
            format!(
                "Auto-tagging needs at least two categorized wee and poop visits with durations. Review the {local_date} journal entry."
            ),
        ),
        AutoCategorizeFailureReason::Ambiguous => (
            format!("Visit duration matched both patterns for {pet_name}"),
            format!(
                "The duration fit both wee and poop history — pick the type manually on {local_date}."
            ),
        ),
        AutoCategorizeFailureReason::NoMatch => (
            format!("Visit duration did not match history for {pet_name}"),
            format!(
                "The logged duration did not match wee or poop patterns — categorize the {local_date} visit manually."
            ),
        ),
    }
}
