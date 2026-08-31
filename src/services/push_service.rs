use std::sync::OnceLock;
use std::time::Duration as StdDuration;

use base64::Engine;
use p256::ecdsa::SigningKey;
use p256::elliptic_curve::rand_core::OsRng;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::SecretKey;
use sqlx::SqlitePool;
use web_push::{
    ContentEncoding, HyperWebPushClient, SubscriptionInfo, SubscriptionKeys, VapidSignatureBuilder,
    WebPushClient, WebPushError, WebPushMessageBuilder,
};

use crate::domain::notification::Notification;
use crate::domain::push::{
    PushConfigPublic, PushPayload, PushSubscribeRequest, PushTestResult, VapidConfig,
};
use crate::error::{AppError, AppResult};
use crate::repo::push_subscriptions::{self, PushSubscriptionRow};
use crate::repo::settings;
use chrono::{Duration, Utc};

const VAPID_SETTINGS_KEY: &str = "vapid";
/// Contact URI for VAPID JWTs. Apple/Safari reject `@localhost` subjects with BadJwtToken.
const DEFAULT_VAPID_SUBJECT: &str = "https://petmon.j0rsa.com";
const DEFAULT_SUBSCRIPTION_TTL_DAYS: i64 = 90;
const PUSH_SEND_TIMEOUT: StdDuration = StdDuration::from_secs(15);

fn web_push_client() -> &'static HyperWebPushClient {
    static CLIENT: OnceLock<HyperWebPushClient> = OnceLock::new();
    CLIENT.get_or_init(HyperWebPushClient::new)
}

fn generate_vapid_keys() -> (String, String) {
    let signing_key = SigningKey::random(&mut OsRng);
    let secret_key = SecretKey::from(signing_key);
    let private_bytes = secret_key.to_bytes();
    let public_bytes = secret_key
        .public_key()
        .to_encoded_point(false)
        .as_bytes()
        .to_vec();

    let private_key = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(private_bytes);
    let public_key = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(public_bytes);
    (public_key, private_key)
}

/// Apple Web Push requires a real `mailto:` or `https:` contact URI — not localhost.
fn is_valid_vapid_subject(subject: &str) -> bool {
    let subject = subject.trim();
    if subject.is_empty() {
        return false;
    }
    let lower = subject.to_ascii_lowercase();
    if lower.contains("localhost") || lower.contains("127.0.0.1") {
        return false;
    }
    if let Some(rest) = lower.strip_prefix("mailto:") {
        return rest.contains('@') && !rest.starts_with('@') && !rest.ends_with('@');
    }
    lower.starts_with("https://") && lower.len() > "https://".len()
}

fn resolve_vapid_subject(existing: Option<&str>) -> String {
    if let Ok(from_env) = std::env::var("VAPID_SUBJECT") {
        let trimmed = from_env.trim();
        if is_valid_vapid_subject(trimmed) {
            return trimmed.to_string();
        }
        if !trimmed.is_empty() {
            tracing::warn!(
                subject = %trimmed,
                "VAPID_SUBJECT is invalid for Apple/Safari web push; expected mailto: or https: contact URI without localhost"
            );
        }
    }
    if let Some(existing) = existing {
        if is_valid_vapid_subject(existing) {
            return existing.trim().to_string();
        }
    }
    DEFAULT_VAPID_SUBJECT.to_string()
}

fn vapid_keys_from_env() -> Option<(String, String)> {
    let public_key = std::env::var("VAPID_PUBLIC_KEY").ok()?;
    let private_key = std::env::var("VAPID_PRIVATE_KEY").ok()?;
    if public_key.trim().is_empty() || private_key.trim().is_empty() {
        return None;
    }
    Some((
        public_key.trim().to_string(),
        private_key.trim().to_string(),
    ))
}

async fn load_vapid_from_settings(pool: &SqlitePool) -> AppResult<Option<VapidConfig>> {
    let cfg: VapidConfig = settings::get(pool, VAPID_SETTINGS_KEY).await?;
    if cfg.public_key.trim().is_empty() || cfg.private_key.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(cfg))
}

async fn ensure_vapid(pool: &SqlitePool) -> AppResult<VapidConfig> {
    if let Some((public_key, private_key)) = vapid_keys_from_env() {
        return Ok(VapidConfig {
            public_key,
            private_key,
            subject: resolve_vapid_subject(None),
        });
    }

    if let Some(mut cfg) = load_vapid_from_settings(pool).await? {
        let subject = resolve_vapid_subject(Some(&cfg.subject));
        if subject != cfg.subject {
            tracing::info!(
                old_subject = %cfg.subject,
                new_subject = %subject,
                "repairing invalid VAPID subject for Apple/Safari web push compatibility"
            );
            cfg.subject = subject;
            settings::upsert(pool, VAPID_SETTINGS_KEY, &cfg).await?;
        }
        return Ok(cfg);
    }

    let (public_key, private_key) = generate_vapid_keys();
    let cfg = VapidConfig {
        public_key,
        private_key,
        subject: resolve_vapid_subject(None),
    };
    settings::upsert(pool, VAPID_SETTINGS_KEY, &cfg).await?;
    tracing::info!(subject = %cfg.subject, "generated and persisted VAPID keys for web push");
    Ok(cfg)
}

fn format_push_delivery_error(error: &WebPushError) -> String {
    let text = error.to_string();
    if text.contains("BadJwtToken") {
        return format!(
            "Push delivery failed: {text}. Apple/Safari rejected the VAPID JWT — set VAPID_SUBJECT to a real mailto: email or https: contact URL (not localhost)."
        );
    }
    format!("Push delivery failed: {text}")
}

fn subscription_ttl_days() -> i64 {
    std::env::var("PUSH_SUBSCRIPTION_TTL_DAYS")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|days| *days > 0)
        .unwrap_or(DEFAULT_SUBSCRIPTION_TTL_DAYS)
}

pub async fn cleanup_stale_subscriptions(pool: &SqlitePool) -> AppResult<u64> {
    let days = subscription_ttl_days();
    let cutoff = (Utc::now() - Duration::days(days)).to_rfc3339();
    let removed = push_subscriptions::delete_stale(pool, &cutoff).await?;
    if removed > 0 {
        tracing::info!(removed, ttl_days = days, "removed stale push subscriptions");
    }
    Ok(removed)
}

pub async fn public_config(pool: &SqlitePool) -> AppResult<PushConfigPublic> {
    match ensure_vapid(pool).await {
        Ok(cfg) => Ok(PushConfigPublic {
            enabled: true,
            public_key: Some(cfg.public_key),
        }),
        Err(e) => {
            tracing::warn!(error = %e, "web push unavailable");
            Ok(PushConfigPublic {
                enabled: false,
                public_key: None,
            })
        }
    }
}

pub async fn subscribe(
    pool: &SqlitePool,
    reader_key: &str,
    req: PushSubscribeRequest,
    user_agent: Option<&str>,
) -> AppResult<()> {
    if req.endpoint.trim().is_empty() {
        return Err(AppError::BadRequest("endpoint is required".to_string()));
    }
    if req.keys.p256dh.trim().is_empty() || req.keys.auth.trim().is_empty() {
        return Err(AppError::BadRequest(
            "subscription keys are required".to_string(),
        ));
    }

    ensure_vapid(pool).await?;
    push_subscriptions::upsert(pool, reader_key, &req, user_agent).await?;
    Ok(())
}

pub async fn unsubscribe(pool: &SqlitePool, endpoint: &str) -> AppResult<()> {
    if endpoint.trim().is_empty() {
        return Err(AppError::BadRequest("endpoint is required".to_string()));
    }
    push_subscriptions::delete_by_endpoint(pool, endpoint).await?;
    Ok(())
}

fn notification_url(notification: &Notification) -> String {
    match &notification.link_hash {
        Some(hash) => format!("{}#{hash}", notification.link_path),
        None => notification.link_path.clone(),
    }
}

fn payload_from_notification(notification: &Notification) -> PushPayload {
    PushPayload {
        title: notification.title.clone(),
        body: notification.body.clone().unwrap_or_default(),
        url: notification_url(notification),
        notification_id: Some(notification.id.clone()),
    }
}

enum DeliveryOutcome {
    Sent,
    Failed { error: String },
}

async fn deliver_to_subscription(
    pool: &SqlitePool,
    vapid: &VapidConfig,
    body: &[u8],
    sub: &PushSubscriptionRow,
) -> DeliveryOutcome {
    let subscription = SubscriptionInfo {
        endpoint: sub.endpoint.clone(),
        keys: SubscriptionKeys {
            p256dh: sub.p256dh.clone(),
            auth: sub.auth.clone(),
        },
    };

    let sig_builder = match VapidSignatureBuilder::from_base64(&vapid.private_key, &subscription) {
        Ok(mut builder) => {
            // Chrome/FCM expect a contact subject claim on VAPID JWTs.
            builder.add_claim("sub", vapid.subject.clone());
            match builder.build() {
                Ok(sig) => sig,
                Err(e) => {
                    tracing::warn!(error = %e, "failed to build VAPID signature");
                    return DeliveryOutcome::Failed {
                        error: format!("Failed to build VAPID signature: {e}"),
                    };
                }
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "invalid VAPID private key");
            return DeliveryOutcome::Failed {
                error: format!("Invalid VAPID private key: {e}"),
            };
        }
    };

    let mut builder = WebPushMessageBuilder::new(&subscription);
    builder.set_payload(ContentEncoding::Aes128Gcm, body);
    builder.set_vapid_signature(sig_builder);
    builder.set_ttl(86400);

    let message = match builder.build() {
        Ok(msg) => msg,
        Err(e) => {
            tracing::warn!(error = %e, "failed to build push message");
            return DeliveryOutcome::Failed {
                error: format!("Failed to build push message: {e}"),
            };
        }
    };

    let _ = push_subscriptions::record_attempt(pool, &sub.endpoint).await;

    // HyperWebPushClient never times out on its own — bound delivery so the
    // Settings "Test" button cannot hang forever on a stalled push endpoint.
    let send_result =
        tokio::time::timeout(PUSH_SEND_TIMEOUT, web_push_client().send(message)).await;

    match send_result {
        Ok(Ok(())) => {
            let _ = push_subscriptions::record_success(pool, &sub.endpoint).await;
            DeliveryOutcome::Sent
        }
        Ok(Err(WebPushError::EndpointNotValid(_) | WebPushError::EndpointNotFound(_))) => {
            tracing::info!(endpoint = %sub.endpoint, "removing stale push subscription");
            let _ = push_subscriptions::delete_by_endpoint(pool, &sub.endpoint).await;
            DeliveryOutcome::Failed {
                error: "Push endpoint is no longer valid. Re-enable notifications and try again."
                    .to_string(),
            }
        }
        Ok(Err(e)) => {
            let error = format_push_delivery_error(&e);
            tracing::warn!(error = %error, endpoint = %sub.endpoint, "push delivery failed");
            DeliveryOutcome::Failed { error }
        }
        Err(_) => {
            let error = format!(
                "Push delivery timed out after {}s. The push service did not respond — try again.",
                PUSH_SEND_TIMEOUT.as_secs()
            );
            tracing::warn!(endpoint = %sub.endpoint, "push delivery timed out");
            DeliveryOutcome::Failed { error }
        }
    }
}

async fn send_payload(
    pool: &SqlitePool,
    vapid: &VapidConfig,
    payload: &PushPayload,
) -> PushTestResult {
    let subscriptions = match push_subscriptions::list_all(pool).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!(error = %e, "failed to list push subscriptions");
            return PushTestResult {
                sent: 0,
                failed: 0,
                error: Some(format!("Failed to list push subscriptions: {e}")),
            };
        }
    };

    if subscriptions.is_empty() {
        return PushTestResult {
            sent: 0,
            failed: 0,
            error: None,
        };
    }

    let body = match serde_json::to_vec(payload) {
        Ok(bytes) => bytes,
        Err(e) => {
            tracing::error!(error = %e, "failed to serialize push payload");
            return PushTestResult {
                sent: 0,
                failed: subscriptions.len() as u32,
                error: Some(format!("Failed to serialize push payload: {e}")),
            };
        }
    };

    let mut sent = 0u32;
    let mut failed = 0u32;

    for sub in subscriptions {
        match deliver_to_subscription(pool, vapid, &body, &sub).await {
            DeliveryOutcome::Sent => sent += 1,
            DeliveryOutcome::Failed { .. } => failed += 1,
        }
    }

    PushTestResult {
        sent,
        failed,
        error: None,
    }
}

/// Send a test notification to a single device subscription (by endpoint).
pub async fn send_test(pool: &SqlitePool, endpoint: &str) -> AppResult<PushTestResult> {
    if endpoint.trim().is_empty() {
        return Err(AppError::BadRequest("endpoint is required".to_string()));
    }

    let vapid = ensure_vapid(pool).await?;
    let sub = push_subscriptions::get_by_endpoint(pool, endpoint.trim())
        .await
        .map_err(|e| match e {
            AppError::NotFound(_) => AppError::BadRequest(
                "This device is not subscribed for push. Allow notifications and try again."
                    .to_string(),
            ),
            other => other,
        })?;

    let payload = PushPayload {
        title: "Petmon test notification".to_string(),
        body: "Push notifications are working.".to_string(),
        url: "/settings".to_string(),
        notification_id: None,
    };

    let body = serde_json::to_vec(&payload)
        .map_err(|e| AppError::Internal(format!("failed to serialize push payload: {e}")))?;

    match deliver_to_subscription(pool, &vapid, &body, &sub).await {
        DeliveryOutcome::Sent => Ok(PushTestResult {
            sent: 1,
            failed: 0,
            error: None,
        }),
        DeliveryOutcome::Failed { error } => Ok(PushTestResult {
            sent: 0,
            failed: 1,
            error: Some(error),
        }),
    }
}

pub async fn broadcast_notification(pool: &SqlitePool, notification: &Notification) {
    let vapid = match ensure_vapid(pool).await {
        Ok(cfg) => cfg,
        Err(e) => {
            tracing::warn!(error = %e, "skipping push broadcast — VAPID unavailable");
            return;
        }
    };

    let payload = payload_from_notification(notification);
    let result = send_payload(pool, &vapid, &payload).await;
    tracing::info!(
        sent = result.sent,
        failed = result.failed,
        notification_id = %notification.id,
        "push notification broadcast complete"
    );
}

pub fn spawn_broadcast(pool: SqlitePool, notification: Notification) {
    tokio::spawn(async move {
        broadcast_notification(&pool, &notification).await;
    });
}

/// Send a push notification to all subscribed devices for a specific reader.
/// Silently skips if VAPID is unavailable or the reader has no subscriptions.
pub async fn send_to_reader(pool: &SqlitePool, reader_key: &str, payload: &PushPayload) {
    let vapid = match ensure_vapid(pool).await {
        Ok(cfg) => cfg,
        Err(e) => {
            tracing::warn!(error = %e, "send_to_reader: VAPID unavailable");
            return;
        }
    };
    let subscriptions = match crate::repo::push_subscriptions::list_for_reader(pool, reader_key)
        .await
    {
        Ok(subs) => subs,
        Err(e) => {
            tracing::warn!(reader_key, error = %e, "send_to_reader: failed to list subscriptions");
            return;
        }
    };
    let body = match serde_json::to_vec(payload) {
        Ok(b) => b,
        Err(e) => {
            tracing::error!(error = %e, "send_to_reader: failed to serialize payload");
            return;
        }
    };
    for sub in subscriptions {
        match deliver_to_subscription(pool, &vapid, &body, &sub).await {
            DeliveryOutcome::Sent => {}
            DeliveryOutcome::Failed { error } => {
                tracing::warn!(endpoint = %sub.endpoint, %error, "send_to_reader: delivery failed");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vapid_subject_rejects_localhost_placeholders() {
        assert!(!is_valid_vapid_subject("mailto:admin@localhost"));
        assert!(!is_valid_vapid_subject("mailto:petmon@127.0.0.1"));
        assert!(!is_valid_vapid_subject("https://localhost"));
        assert!(!is_valid_vapid_subject(""));
        assert!(!is_valid_vapid_subject("admin@example.com"));
        assert!(!is_valid_vapid_subject("http://example.com"));
    }

    #[test]
    fn vapid_subject_accepts_mailto_and_https_contacts() {
        assert!(is_valid_vapid_subject("mailto:ops@example.com"));
        assert!(is_valid_vapid_subject("https://example.com/contact"));
        assert!(is_valid_vapid_subject(DEFAULT_VAPID_SUBJECT));
    }

    #[test]
    fn resolve_subject_falls_back_when_existing_is_localhost() {
        let subject = resolve_vapid_subject(Some("mailto:admin@localhost"));
        assert_eq!(subject, DEFAULT_VAPID_SUBJECT);
        assert!(is_valid_vapid_subject(&subject));
    }
}
