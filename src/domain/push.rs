use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VapidConfig {
    pub public_key: String,
    pub private_key: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushSubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushSubscribeRequest {
    pub endpoint: String,
    pub keys: PushSubscriptionKeys,
}

#[derive(Debug, Clone, Serialize)]
pub struct PushConfigPublic {
    pub enabled: bool,
    pub public_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PushTestResult {
    pub sent: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct PushPayload {
    pub title: String,
    pub body: String,
    pub url: String,
    #[serde(rename = "notificationId")]
    pub notification_id: Option<String>,
}
