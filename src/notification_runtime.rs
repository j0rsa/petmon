//! Notification persistence and audience are one explicit embedding contract.
//!
//! Implementations can atomically persist durable resource ownership with the event,
//! filter before pagination, and keep dismissal personal. Missing ownership must not
//! be interpreted as a broadcast. Only the standalone implementation opts into it.
use crate::auth::identity::Identity;
use crate::domain::notification::{CreateNotification, Notification};
use crate::error::AppResult;
use crate::repo::notifications;
use futures::future::BoxFuture;
use sqlx::SqlitePool;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Recipients {
    AllSubscribers,
    Readers(Vec<String>),
}

pub trait NotificationBackend: Send + Sync {
    fn create<'a>(
        &'a self,
        pool: &'a SqlitePool,
        event: CreateNotification,
    ) -> BoxFuture<'a, AppResult<Option<Notification>>>;
    fn list<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
        limit: i64,
        unread_only: bool,
    ) -> BoxFuture<'a, AppResult<Vec<(Notification, bool)>>>;
    fn unread_count<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
    ) -> BoxFuture<'a, AppResult<i64>>;
    fn mark_read<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
        id: &'a str,
    ) -> BoxFuture<'a, AppResult<()>>;
    fn mark_all_read<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
    ) -> BoxFuture<'a, AppResult<()>>;
    fn dismiss_all<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
    ) -> BoxFuture<'a, AppResult<()>>;
    /// Resolve current access at delivery time, not when a task was enqueued.
    fn recipients<'a>(
        &'a self,
        pool: &'a SqlitePool,
        event: &'a Notification,
    ) -> BoxFuture<'a, AppResult<Recipients>>;
}

/// Explicit compatibility implementation for a standalone, shared-data instance.
pub struct StandaloneNotifications;
impl NotificationBackend for StandaloneNotifications {
    fn create<'a>(
        &'a self,
        pool: &'a SqlitePool,
        event: CreateNotification,
    ) -> BoxFuture<'a, AppResult<Option<Notification>>> {
        Box::pin(notifications::create(pool, event))
    }
    fn list<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
        limit: i64,
        unread_only: bool,
    ) -> BoxFuture<'a, AppResult<Vec<(Notification, bool)>>> {
        Box::pin(async move {
            notifications::list_for_reader(pool, &actor.reader_key(), limit, unread_only).await
        })
    }
    fn unread_count<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
    ) -> BoxFuture<'a, AppResult<i64>> {
        Box::pin(async move { notifications::unread_count(pool, &actor.reader_key()).await })
    }
    fn mark_read<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
        id: &'a str,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async move { notifications::mark_read(pool, id, &actor.reader_key()).await })
    }
    fn mark_all_read<'a>(
        &'a self,
        pool: &'a SqlitePool,
        actor: &'a Identity,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async move {
            notifications::mark_all_read(pool, &actor.reader_key()).await?;
            Ok(())
        })
    }
    fn dismiss_all<'a>(
        &'a self,
        pool: &'a SqlitePool,
        _: &'a Identity,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async move {
            notifications::delete_all(pool).await?;
            Ok(())
        })
    }
    fn recipients<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Notification,
    ) -> BoxFuture<'a, AppResult<Recipients>> {
        Box::pin(async { Ok(Recipients::AllSubscribers) })
    }
}
