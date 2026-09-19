use crate::domain::elimination::EliminationRecord;
use crate::domain::notification::{
    CreateNotification, NotificationUnreadCount, NotificationView,
    KIND_ELIMINATION_AUTO_CATEGORIZE_FAILED, KIND_FEEDING_NUDGE, SOURCE_KIND_FEEDING_NUDGE,
};
use crate::domain::nutrition_status::ScheduleKind;
use crate::embedding::{ResourceAction, ServiceContext};
use crate::error::AppResult;
use crate::services::elimination_auto_categorize::AutoCategorizeFailureReason;
use crate::services::push_service;

#[tracing::instrument(skip(pool))]
pub async fn list(
    pool: &ServiceContext,
    limit: i64,
    unread_only: bool,
) -> AppResult<Vec<NotificationView>> {
    pool.require_action_scope(ResourceAction::View)?;
    let rows = pool
        .notifications
        .list(pool, &pool.actor, limit.clamp(1, 200), unread_only)
        .await?;
    Ok(rows
        .into_iter()
        .map(|(n, read)| NotificationView::from_row(n, read))
        .collect())
}

#[tracing::instrument(skip(pool))]
pub async fn unread_count(pool: &ServiceContext) -> AppResult<NotificationUnreadCount> {
    pool.require_action_scope(ResourceAction::View)?;
    let count = pool.notifications.unread_count(pool, &pool.actor).await?;
    Ok(NotificationUnreadCount { count })
}

#[tracing::instrument(skip(pool))]
pub async fn mark_read(pool: &ServiceContext, notification_id: &str) -> AppResult<()> {
    pool.require_action_scope(ResourceAction::WriteRecords)?;
    pool.notifications
        .mark_read(pool, &pool.actor, notification_id)
        .await
}

#[tracing::instrument(skip(pool))]
pub async fn mark_all_read(pool: &ServiceContext) -> AppResult<NotificationUnreadCount> {
    pool.require_action_scope(ResourceAction::WriteRecords)?;
    pool.notifications.mark_all_read(pool, &pool.actor).await?;
    Ok(NotificationUnreadCount {
        count: pool.notifications.unread_count(pool, &pool.actor).await?,
    })
}

#[tracing::instrument(skip(pool))]
pub async fn dismiss_all(pool: &ServiceContext) -> AppResult<NotificationUnreadCount> {
    pool.require_action_scope(ResourceAction::WriteRecords)?;
    pool.notifications.dismiss_all(pool, &pool.actor).await?;
    Ok(NotificationUnreadCount {
        count: pool.notifications.unread_count(pool, &pool.actor).await?,
    })
}

#[tracing::instrument(skip(pool))]
pub async fn notify_elimination_auto_categorize_failed(
    pool: &ServiceContext,
    record: &EliminationRecord,
    pet_name: &str,
    reason: AutoCategorizeFailureReason,
) -> AppResult<()> {
    let (title, body) = failure_copy(pet_name, record.local_date.as_str(), reason);
    let link_path = format!("/elimination/{}", record.local_date);

    let created = pool
        .notifications
        .create(
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
        push_service::spawn_broadcast_context(pool.clone(), notification);
    }
    Ok(())
}

#[tracing::instrument(skip(pool, schedule))]
pub async fn notify_feeding_nudge(
    pool: &ServiceContext,
    schedule: &crate::domain::nutrition_schedule::NutritionSchedule,
    pet_name: &str,
    kind: ScheduleKind,
    local_date: &str,
    window_from: &str,
) -> AppResult<()> {
    let noun = kind.noun();
    let created = pool
        .notifications
        .create(
            pool,
            CreateNotification {
                kind: KIND_FEEDING_NUDGE.to_string(),
                title: format!("Time to give some {noun} to {pet_name}."),
                body: Some(format!("{} · {window_from}", schedule.name)),
                link_path: "/nutrition".to_string(),
                link_hash: None,
                pet_id: Some(schedule.pet_id),
                pet_name: Some(pet_name.to_string()),
                source_kind: Some(SOURCE_KIND_FEEDING_NUDGE.to_string()),
                source_id: Some(format!("{}:{local_date}:{window_from}", schedule.id)),
            },
        )
        .await?;

    if let Some(notification) = created {
        push_service::spawn_broadcast_context(pool.clone(), notification);
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
