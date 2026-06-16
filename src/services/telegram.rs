use sqlx::SqlitePool;

use crate::domain::nutrition_record::NutritionRecord;
use crate::domain::pet::Pet;
use crate::domain::settings::TelegramConfig;
use crate::repo::{pets, settings};

/// Format a nutrition record as a Telegram log line.
/// Example: `#cat_ate #wet_food 75`
fn format_record_line(record: &NutritionRecord) -> String {
    format!("#cat_ate #{} {}", record.category, record.amount.round() as i64)
}

/// Fire-and-forget: send a record to the pet's configured Telegram chat.
/// Bot token comes from the global app settings; chat_id and thread_id are per-pet.
/// Errors are logged but never propagated — a Telegram outage must not break record creation.
pub async fn notify_record(pool: &SqlitePool, record: &NutritionRecord) {
    // Load global config for the bot token and enabled flag
    let cfg: TelegramConfig = match settings::get(pool, "telegram").await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, "failed to load telegram config");
            return;
        }
    };

    if !cfg.enabled {
        return;
    }

    let bot_token = match cfg.bot_token {
        Some(t) => t,
        None => {
            tracing::debug!("telegram enabled but bot_token not set, skipping");
            return;
        }
    };

    // Load the pet to get its per-pet chat config
    let pet: Pet = match pets::get_pet(pool, record.pet_id).await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = %e, "failed to load pet for telegram notification");
            return;
        }
    };

    let chat_id = match pet.telegram_chat_id {
        Some(ref c) => c.clone(),
        None => {
            tracing::debug!(pet = %pet.name, "no telegram_chat_id set for pet, skipping");
            return;
        }
    };

    let text = format_record_line(record);
    let url = format!("https://api.telegram.org/bot{bot_token}/sendMessage");

    let mut payload = serde_json::json!({ "chat_id": chat_id, "text": text });
    if let Some(thread_id) = &pet.telegram_thread_id {
        payload["message_thread_id"] = serde_json::Value::String(thread_id.clone());
    }

    match reqwest::Client::new()
        .post(&url)
        .json(&payload)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            tracing::debug!(pet = %pet.name, category = %record.category, "telegram notification sent");
        }
        Ok(resp) => {
            tracing::warn!(status = %resp.status(), pet = %pet.name, "telegram API returned non-success");
        }
        Err(e) => {
            tracing::warn!(error = %e, pet = %pet.name, "failed to send telegram notification");
        }
    }
}
