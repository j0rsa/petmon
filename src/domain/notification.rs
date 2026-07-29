use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const KIND_ELIMINATION_AUTO_CATEGORIZE_FAILED: &str = "elimination.auto_categorize_failed";

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Notification {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub link_path: String,
    pub link_hash: Option<String>,
    pub pet_id: Option<Uuid>,
    pub pet_name: Option<String>,
    pub source_kind: Option<String>,
    pub source_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotificationView {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub link_path: String,
    pub link_hash: Option<String>,
    pub pet_id: Option<String>,
    pub pet_name: Option<String>,
    pub created_at: String,
    pub read: bool,
}

impl NotificationView {
    pub fn from_row(row: Notification, read: bool) -> Self {
        Self {
            id: row.id,
            kind: row.kind,
            title: row.title,
            body: row.body,
            link_path: row.link_path,
            link_hash: row.link_hash,
            pet_id: row.pet_id.map(|id| id.to_string()),
            pet_name: row.pet_name,
            created_at: row.created_at,
            read,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CreateNotification {
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub link_path: String,
    pub link_hash: Option<String>,
    pub pet_id: Option<Uuid>,
    pub pet_name: Option<String>,
    pub source_kind: Option<String>,
    pub source_id: Option<String>,
}

impl CreateNotification {
    pub fn into_row(self) -> Notification {
        let now = Utc::now().to_rfc3339();
        Notification {
            id: Uuid::new_v4().to_string(),
            kind: self.kind,
            title: self.title,
            body: self.body,
            link_path: self.link_path,
            link_hash: self.link_hash,
            pet_id: self.pet_id,
            pet_name: self.pet_name,
            source_kind: self.source_kind,
            source_id: self.source_id,
            created_at: now,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct NotificationListQuery {
    pub limit: Option<i64>,
    pub unread_only: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct NotificationUnreadCount {
    pub count: i64,
}
