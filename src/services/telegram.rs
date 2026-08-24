use sqlx::SqlitePool;

use crate::domain::medication::MedIntakeRecord;
use crate::domain::nutrition_record::NutritionRecord;
use crate::domain::pet::Pet;
use crate::domain::settings::{DateFormat, TelegramConfig, TimeFormat};
use crate::domain::user_settings::UserDisplaySettings;
use crate::repo::{nutrition_records, pets, settings};

/// Format a nutrition record as a Telegram log line.
/// Example: `#cat_ate #wet_food 75` or `#cat_ate #wet_food 75 — chicken pate`
fn format_record_line(record: &NutritionRecord) -> String {
    let base = format!(
        "#cat_ate #{} {}",
        record.category,
        record.amount.round() as i64
    );
    match record.note.as_deref() {
        Some(note) if !note.trim().is_empty() => format!("{base} — {note}"),
        _ => base,
    }
}

/// Fire-and-forget: send a medication intake to the configured medication chat.
#[tracing::instrument(skip(pool, record), fields(record_id = %record.id))]
pub async fn notify_medication_intake(
    pool: &SqlitePool,
    record: &MedIntakeRecord,
    delayed: bool,
    display_settings: UserDisplaySettings,
) {
    let Some(ctx) = load_medication_telegram_context(pool, record).await else {
        return;
    };
    let medication = match crate::repo::medications::get(pool, &record.medication_id).await {
        Ok(medication) => medication,
        Err(e) => {
            tracing::warn!(error = %e, record_id = %record.id, "failed to load medication for telegram notification");
            return;
        }
    };
    let mut payload = serde_json::json!({
        "chat_id": ctx.chat_id,
        "text": format_medication_intake_line(
            &medication.name,
            medication.emoji.as_deref(),
            &record.dose_label,
            &record.occurred_at,
            delayed,
            display_settings.date_format,
            display_settings.time_format,
        ),
    });
    apply_thread_id(&mut payload, &ctx.thread_id);

    match post_telegram(&ctx.bot_token, "sendMessage", &payload).await {
        Ok(body) => {
            if let Some(message_id) = body.pointer("/result/message_id").and_then(|v| v.as_i64()) {
                if let Err(e) = crate::repo::med_intake_records::set_telegram_message_id(
                    pool, &record.id, message_id,
                )
                .await
                {
                    tracing::warn!(error = %e, record_id = %record.id, "failed to store medication telegram message id");
                }
            }
            tracing::info!(pet = %ctx.pet_name, record_id = %record.id, "medication telegram notification sent");
        }
        Err(err) => {
            tracing::warn!(%err, pet = %ctx.pet_name, record_id = %record.id, "medication telegram sendMessage failed");
        }
    }
}

/// Fire-and-forget: send one Telegram message covering every intake in a bundle.
#[tracing::instrument(skip(pool, records), fields(count = records.len()))]
pub async fn notify_medication_bundle_intake(
    pool: &SqlitePool,
    records: &[MedIntakeRecord],
    delayed: bool,
    display_settings: UserDisplaySettings,
) {
    let Some(first) = records.first() else {
        return;
    };
    let Some(ctx) = load_medication_telegram_context(pool, first).await else {
        return;
    };
    let Some(text) =
        format_records_as_medication_text(pool, records, delayed, &display_settings).await
    else {
        return;
    };
    let mut payload = serde_json::json!({
        "chat_id": ctx.chat_id,
        "text": text,
    });
    apply_thread_id(&mut payload, &ctx.thread_id);

    match post_telegram(&ctx.bot_token, "sendMessage", &payload).await {
        Ok(body) => {
            if let Some(message_id) = body.pointer("/result/message_id").and_then(|v| v.as_i64()) {
                for record in records {
                    if let Err(e) = crate::repo::med_intake_records::set_telegram_message_id(
                        pool, &record.id, message_id,
                    )
                    .await
                    {
                        tracing::warn!(error = %e, record_id = %record.id, "failed to store medication telegram message id");
                    }
                }
            }
            tracing::info!(pet = %ctx.pet_name, count = records.len(), "medication bundle telegram notification sent");
        }
        Err(err) => {
            tracing::warn!(%err, pet = %ctx.pet_name, "medication bundle telegram sendMessage failed");
        }
    }
}

/// Fire-and-forget: delete or edit the Telegram message for a removed medication intake.
/// Bundle intakes share one message — remaining lines are edited in place.
#[tracing::instrument(skip(pool, record), fields(record_id = %record.id))]
pub async fn notify_medication_intake_delete(pool: &SqlitePool, record: &MedIntakeRecord) {
    let Some(message_id) = record.telegram_message_id else {
        tracing::debug!(record_id = %record.id, "no telegram_message_id, skipping medication delete notification");
        return;
    };
    let Some(ctx) = load_medication_telegram_context(pool, record).await else {
        return;
    };
    let remaining = match crate::repo::med_intake_records::list_by_telegram_message_id(
        pool, message_id,
    )
    .await
    {
        Ok(records) => records,
        Err(e) => {
            tracing::warn!(error = %e, message_id, "failed to load remaining medication telegram records");
            return;
        }
    };
    if remaining.is_empty() {
        let payload = serde_json::json!({
            "chat_id": ctx.chat_id,
            "message_id": message_id,
        });
        match post_telegram(&ctx.bot_token, "deleteMessage", &payload).await {
            Ok(_) => {
                tracing::info!(pet = %ctx.pet_name, record_id = %record.id, "medication telegram message deleted");
            }
            Err(err) => {
                tracing::warn!(%err, pet = %ctx.pet_name, record_id = %record.id, "medication telegram deleteMessage failed");
            }
        }
        return;
    }
    let Some(text) =
        format_records_as_medication_text(pool, &remaining, false, &UserDisplaySettings::default())
            .await
    else {
        return;
    };
    let mut payload = serde_json::json!({
        "chat_id": ctx.chat_id,
        "message_id": message_id,
        "text": text,
    });
    apply_thread_id(&mut payload, &ctx.thread_id);
    match post_telegram(&ctx.bot_token, "editMessageText", &payload).await {
        Ok(_) => {
            tracing::info!(pet = %ctx.pet_name, record_id = %record.id, remaining = remaining.len(), "medication telegram message edited after partial undo");
        }
        Err(err) => {
            tracing::warn!(%err, pet = %ctx.pet_name, record_id = %record.id, "medication telegram editMessageText failed");
        }
    }
}

async fn format_records_as_medication_text(
    pool: &SqlitePool,
    records: &[MedIntakeRecord],
    delayed: bool,
    display_settings: &UserDisplaySettings,
) -> Option<String> {
    let mut lines = Vec::with_capacity(records.len());
    for record in records {
        let medication = match crate::repo::medications::get(pool, &record.medication_id).await {
            Ok(medication) => medication,
            Err(e) => {
                tracing::warn!(error = %e, record_id = %record.id, "failed to load medication for telegram notification");
                return None;
            }
        };
        lines.push(format_medication_intake_line(
            &medication.name,
            medication.emoji.as_deref(),
            &record.dose_label,
            &record.occurred_at,
            delayed,
            display_settings.date_format.clone(),
            display_settings.time_format.clone(),
        ));
    }
    Some(lines.join("\n"))
}

fn format_medication_intake_line(
    medication_name: &str,
    medication_emoji: Option<&str>,
    dose_label: &str,
    occurred_at: &str,
    delayed: bool,
    date_format: DateFormat,
    time_format: TimeFormat,
) -> String {
    let emoji = medication_emoji
        .filter(|emoji| !emoji.trim().is_empty())
        .unwrap_or("💊");
    let line = format!("#pills {medication_name} {dose_label} {emoji}");
    if delayed {
        format!(
            "{line} - {}",
            format_intake_timestamp(occurred_at, date_format, time_format)
        )
    } else {
        line
    }
}

fn format_intake_timestamp(
    occurred_at: &str,
    date_format: DateFormat,
    time_format: TimeFormat,
) -> String {
    let Ok(timestamp) = chrono::NaiveDateTime::parse_from_str(occurred_at, "%Y-%m-%dT%H:%M:%S")
    else {
        return occurred_at.to_string();
    };
    let date = match date_format {
        DateFormat::Dmy => timestamp.format("%d.%m.%Y").to_string(),
        DateFormat::MmmDdYyyy => timestamp.format("%b %-d, %Y").to_string(),
    };
    let time = match time_format {
        TimeFormat::H24 => timestamp.format("%H:%M").to_string(),
        TimeFormat::H12 => {
            use chrono::Timelike;
            let hour = timestamp.hour();
            let suffix = if hour >= 12 { "pm" } else { "am" };
            let h12 = match hour % 12 {
                0 => 12,
                h => h,
            };
            format!("{h12}:{:02} {suffix}", timestamp.minute())
        }
    };
    format!("{date} {time}")
}

struct TelegramContext {
    bot_token: String,
    chat_id: String,
    thread_id: Option<String>,
    pet_name: String,
}

async fn load_telegram_context(
    pool: &SqlitePool,
    record: &NutritionRecord,
) -> Option<TelegramContext> {
    let cfg: TelegramConfig = match settings::get(pool, "telegram").await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, "failed to load telegram config");
            return None;
        }
    };

    if !cfg.enabled {
        tracing::debug!("telegram disabled, skipping notification");
        return None;
    }

    let bot_token = match cfg.bot_token {
        Some(t) if !t.trim().is_empty() => t.trim().to_owned(),
        _ => {
            tracing::warn!("telegram enabled but bot_token not set, skipping notification");
            return None;
        }
    };

    let pet: Pet = match pets::get_pet(pool, record.pet_id).await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = %e, "failed to load pet for telegram notification");
            return None;
        }
    };

    let chat_id = match pet.telegram_nutrition_chat_id {
        Some(ref c) if !c.trim().is_empty() => c.trim().to_owned(),
        _ => {
            tracing::info!(pet = %pet.name, "no telegram_nutrition_chat_id set for pet, skipping notification");
            return None;
        }
    };

    Some(TelegramContext {
        bot_token,
        chat_id,
        thread_id: pet.telegram_nutrition_thread_id,
        pet_name: pet.name,
    })
}

async fn load_medication_telegram_context(
    pool: &SqlitePool,
    record: &MedIntakeRecord,
) -> Option<TelegramContext> {
    let cfg: TelegramConfig = match settings::get(pool, "telegram").await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, "failed to load telegram config");
            return None;
        }
    };
    if !cfg.enabled {
        tracing::debug!("telegram disabled, skipping notification");
        return None;
    }
    let bot_token = match cfg.bot_token {
        Some(t) if !t.trim().is_empty() => t.trim().to_owned(),
        _ => {
            tracing::warn!("telegram enabled but bot_token not set, skipping notification");
            return None;
        }
    };
    let pet: Pet = match pets::get_pet(pool, record.pet_id).await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = %e, "failed to load pet for medication telegram notification");
            return None;
        }
    };
    let chat_id = match pet.telegram_meds_chat_id {
        Some(ref c) if !c.trim().is_empty() => c.trim().to_owned(),
        _ => {
            tracing::info!(pet = %pet.name, "no telegram_meds_chat_id set for pet, skipping notification");
            return None;
        }
    };
    Some(TelegramContext {
        bot_token,
        chat_id,
        thread_id: pet.telegram_meds_thread_id,
        pet_name: pet.name,
    })
}

fn apply_thread_id(payload: &mut serde_json::Value, thread_id: &Option<String>) {
    if let Some(thread_id) = thread_id {
        payload["message_thread_id"] = serde_json::Value::String(thread_id.clone());
    }
}

async fn post_telegram(
    bot_token: &str,
    endpoint: &str,
    payload: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let url = format!("https://api.telegram.org/bot{bot_token}/{endpoint}");
    let resp = reqwest::Client::new()
        .post(&url)
        .json(payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if status.is_success() && body.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        Ok(body)
    } else {
        Err(format!("status={status} body={body}"))
    }
}

/// Fire-and-forget: send a record to the pet's configured Telegram chat.
/// Bot token comes from the global app settings; chat_id and thread_id are per-pet.
/// On success, stores the Telegram message ID on the record.
/// Errors are logged but never propagated — a Telegram outage must not break record creation.
#[tracing::instrument(skip(pool, record), fields(pet_id = %record.pet_id, category = %record.category, amount = record.amount))]
pub async fn notify_record(pool: &SqlitePool, record: &NutritionRecord) {
    let Some(ctx) = load_telegram_context(pool, record).await else {
        return;
    };

    let text = format_record_line(record);
    let mut payload = serde_json::json!({ "chat_id": ctx.chat_id, "text": text });
    apply_thread_id(&mut payload, &ctx.thread_id);

    match post_telegram(&ctx.bot_token, "sendMessage", &payload).await {
        Ok(body) => {
            if let Some(message_id) = body.pointer("/result/message_id").and_then(|v| v.as_i64()) {
                if let Err(e) =
                    nutrition_records::set_telegram_message_id(pool, &record.id, message_id).await
                {
                    tracing::warn!(error = %e, record_id = %record.id, "failed to store telegram message id");
                }
            }
            tracing::info!(pet = %ctx.pet_name, category = %record.category, "telegram notification sent");
        }
        Err(err) => {
            tracing::warn!(%err, pet = %ctx.pet_name, "telegram sendMessage failed");
        }
    }
}

/// Fire-and-forget: update the Telegram message for an edited record.
/// Tries editMessageText first; if that fails, replies with "Correction: …".
#[tracing::instrument(skip(pool, record), fields(record_id = %record.id))]
pub async fn notify_record_update(pool: &SqlitePool, record: &NutritionRecord) {
    let Some(message_id) = record.telegram_message_id else {
        tracing::debug!(record_id = %record.id, "no telegram_message_id, skipping update notification");
        return;
    };

    let Some(ctx) = load_telegram_context(pool, record).await else {
        return;
    };

    let text = format_record_line(record);
    let mut edit_payload = serde_json::json!({
        "chat_id": ctx.chat_id,
        "message_id": message_id,
        "text": text,
    });
    apply_thread_id(&mut edit_payload, &ctx.thread_id);

    if post_telegram(&ctx.bot_token, "editMessageText", &edit_payload)
        .await
        .is_ok()
    {
        tracing::info!(pet = %ctx.pet_name, record_id = %record.id, "telegram message edited");
        return;
    }

    let correction = format!("Correction: {text}");
    let mut reply_payload = serde_json::json!({
        "chat_id": ctx.chat_id,
        "text": correction,
        "reply_to_message_id": message_id,
    });
    apply_thread_id(&mut reply_payload, &ctx.thread_id);

    match post_telegram(&ctx.bot_token, "sendMessage", &reply_payload).await {
        Ok(_) => {
            tracing::info!(
                pet = %ctx.pet_name,
                record_id = %record.id,
                "telegram edit failed; sent correction reply"
            );
        }
        Err(err) => {
            tracing::warn!(%err, pet = %ctx.pet_name, record_id = %record.id, "telegram correction reply failed");
        }
    }
}

/// Fire-and-forget: delete the Telegram message for a removed record.
#[tracing::instrument(skip(pool, record), fields(record_id = %record.id))]
pub async fn notify_record_delete(pool: &SqlitePool, record: &NutritionRecord) {
    let Some(message_id) = record.telegram_message_id else {
        tracing::debug!(record_id = %record.id, "no telegram_message_id, skipping delete notification");
        return;
    };

    let Some(ctx) = load_telegram_context(pool, record).await else {
        return;
    };

    let payload = serde_json::json!({
        "chat_id": ctx.chat_id,
        "message_id": message_id,
    });

    match post_telegram(&ctx.bot_token, "deleteMessage", &payload).await {
        Ok(_) => {
            tracing::info!(pet = %ctx.pet_name, record_id = %record.id, "telegram message deleted");
        }
        Err(err) => {
            tracing::warn!(%err, pet = %ctx.pet_name, record_id = %record.id, "telegram deleteMessage failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{format_intake_timestamp, format_medication_intake_line, DateFormat, TimeFormat};

    #[test]
    fn format_intake_timestamp_trims_seconds() {
        assert_eq!(
            format_intake_timestamp("2026-08-21T21:53:00", DateFormat::Dmy, TimeFormat::H24),
            "21.08.2026 21:53"
        );
    }

    #[test]
    fn format_intake_timestamp_uses_12h_when_configured() {
        assert_eq!(
            format_intake_timestamp(
                "2026-08-21T21:53:00",
                DateFormat::MmmDdYyyy,
                TimeFormat::H12,
            ),
            "Aug 21, 2026 9:53 pm"
        );
    }

    #[test]
    fn format_medication_intake_distinguishes_immediate_and_delayed_records() {
        assert_eq!(
            format_medication_intake_line(
                "Amoxicillin",
                Some("🦠"),
                "½ × 50mg = 25.00mg",
                "",
                false,
                DateFormat::Dmy,
                TimeFormat::H24,
            ),
            "#pills Amoxicillin ½ × 50mg = 25.00mg 🦠"
        );
        assert_eq!(
            format_medication_intake_line(
                "Amoxicillin",
                None,
                "½ × 50mg = 25.00mg",
                "2026-08-21T21:53:00",
                true,
                DateFormat::MmmDdYyyy,
                TimeFormat::H24,
            ),
            "#pills Amoxicillin ½ × 50mg = 25.00mg 💊 - Aug 21, 2026 21:53"
        );
    }

    #[test]
    fn format_medication_bundle_joins_one_line_per_med() {
        let first = format_medication_intake_line(
            "Prednisolone",
            Some("💊"),
            "½ × 5mg = 2.50mg",
            "2026-08-24T08:00:00",
            false,
            DateFormat::Dmy,
            TimeFormat::H24,
        );
        let second = format_medication_intake_line(
            "Gabapentin",
            Some("🌙"),
            "1 × 50mg = 50.00mg",
            "2026-08-24T08:00:00",
            false,
            DateFormat::Dmy,
            TimeFormat::H24,
        );
        assert_eq!(
            format!("{first}\n{second}"),
            "#pills Prednisolone ½ × 5mg = 2.50mg 💊\n#pills Gabapentin 1 × 50mg = 50.00mg 🌙"
        );
    }
}
