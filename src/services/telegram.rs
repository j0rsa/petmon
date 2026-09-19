use sqlx::SqlitePool;

use crate::domain::medication::MedIntakeRecord;
use crate::domain::nutrition_record::NutritionRecord;
use crate::domain::pet::Pet;
use crate::domain::settings::{DateFormat, TelegramConfig, TimeFormat};
use crate::domain::user_settings::UserDisplaySettings;
use crate::embedding::ServiceContext;
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
    pool: &ServiceContext,
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
    let Some(local_time) = medication_display_time(pool, record).await else {
        return;
    };
    let mut payload = serde_json::json!({
        "chat_id": ctx.chat_id,
        "text": format_medication_intake_line(
            &medication.name,
            medication.emoji.as_deref(),
            &record.dose_label,
            &local_time,
            delayed,
            display_settings.date_format,
            display_settings.time_format,
        ),
    });
    apply_thread_id(&mut payload, &ctx.thread_id);

    match post_telegram(&ctx.bot_token, "sendMessage", &payload).await {
        Ok(body) => {
            if let Some((message_id, chat_id, thread_id)) = delivery_coordinates(&ctx, &body) {
                if let Err(e) = crate::repo::med_intake_records::set_telegram_delivery(
                    pool,
                    &record.id,
                    message_id,
                    &chat_id,
                    thread_id.as_deref(),
                    &ctx.bot_id,
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
    pool: &ServiceContext,
    records: &[MedIntakeRecord],
    delayed: bool,
    display_settings: UserDisplaySettings,
) {
    let Some(first) = records.first() else {
        return;
    };
    if records.iter().any(|record| record.pet_id != first.pet_id) {
        tracing::warn!("refusing Telegram bundle spanning multiple pets");
        return;
    }
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
            if let Some((message_id, chat_id, thread_id)) = delivery_coordinates(&ctx, &body) {
                let ids: Vec<String> = records.iter().map(|record| record.id.clone()).collect();
                if let Err(e) = crate::repo::med_intake_records::set_telegram_bundle_delivery(
                    pool,
                    &ids,
                    message_id,
                    &chat_id,
                    thread_id.as_deref(),
                    &ctx.bot_id,
                )
                .await
                {
                    tracing::warn!(error = %e, "failed to store medication bundle Telegram delivery");
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
pub async fn notify_medication_intake_delete(pool: &ServiceContext, record: &MedIntakeRecord) {
    let Some(message_id) = record.telegram_message_id else {
        tracing::debug!(record_id = %record.id, "no telegram_message_id, skipping medication delete notification");
        return;
    };
    let Some(ctx) = load_stored_context(
        pool,
        record.pet_id,
        record.telegram_chat_id.as_deref(),
        record.telegram_thread_id.as_deref(),
        record.telegram_bot_id.as_deref(),
    )
    .await
    else {
        return;
    };
    let remaining = match crate::repo::med_intake_records::list_by_telegram_delivery(pool, record)
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
    pool: &ServiceContext,
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
        let local_time = medication_display_time(pool, record).await?;
        lines.push(format_medication_intake_line(
            &medication.name,
            medication.emoji.as_deref(),
            &record.dose_label,
            &local_time,
            delayed,
            display_settings.date_format.clone(),
            display_settings.time_format.clone(),
        ));
    }
    Some(lines.join("\n"))
}

async fn medication_display_time(
    context: &ServiceContext,
    record: &MedIntakeRecord,
) -> Option<String> {
    let result = async {
        let timezone = context.timezone(record.pet_id).await?;
        crate::record_time::local_datetime(&record.occurred_at, timezone)
            .map(|time| time.format("%Y-%m-%dT%H:%M:%S").to_string())
    }
    .await;
    match result {
        Ok(time) => Some(time),
        Err(error) => {
            tracing::warn!(%error, record_id = %record.id, "failed to resolve medication display time");
            None
        }
    }
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
    bot_id: String,
    chat_id: String,
    thread_id: Option<String>,
    pet_name: String,
}

/// Telegram bot tokens prefix their secret with the stable numeric bot ID.
/// Store only this public ID; rotating a secret for the same bot remains safe.
fn bot_id(token: &str) -> Option<String> {
    let (id, secret) = token.split_once(':')?;
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) || secret.is_empty() {
        return None;
    }
    Some(id.to_owned())
}

fn delivery_coordinates(
    ctx: &TelegramContext,
    response: &serde_json::Value,
) -> Option<(i64, String, Option<String>)> {
    let message_id = response.pointer("/result/message_id")?.as_i64()?;
    // Persist the returned numeric destination, not a mutable @username alias.
    let chat_id = response.pointer("/result/chat/id")?.as_i64()?.to_string();
    let thread_id = response
        .pointer("/result/message_thread_id")
        .and_then(|id| id.as_i64())
        .map(|id| id.to_string())
        .or_else(|| ctx.thread_id.clone());
    Some((message_id, chat_id, thread_id))
}

async fn load_stored_context(
    pool: &SqlitePool,
    pet_id: uuid::Uuid,
    chat_id: Option<&str>,
    thread_id: Option<&str>,
    stored_bot_id: Option<&str>,
) -> Option<TelegramContext> {
    let (Some(chat_id), Some(stored_bot_id)) = (chat_id, stored_bot_id) else {
        tracing::warn!(%pet_id, "legacy Telegram delivery has no verified original destination; skipping external mutation");
        return None;
    };
    let cfg: TelegramConfig = match settings::get(pool, "telegram").await {
        Ok(config) => config,
        Err(error) => {
            tracing::warn!(%error, "failed to load Telegram config");
            return None;
        }
    };
    if !cfg.enabled {
        return None;
    }
    let token = cfg.bot_token?;
    let current_bot_id = bot_id(token.trim())?;
    if current_bot_id != stored_bot_id {
        tracing::warn!(%pet_id, "Telegram bot changed; skipping mutation of another bot's delivery");
        return None;
    }
    Some(TelegramContext {
        bot_token: token.trim().to_owned(),
        bot_id: current_bot_id,
        chat_id: chat_id.to_owned(),
        thread_id: thread_id.map(str::to_owned),
        pet_name: pet_id.to_string(),
    })
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
        bot_id: bot_id(&bot_token)?,
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
        bot_id: bot_id(&bot_token)?,
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
        .map_err(|e| e.without_url().to_string())?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| e.without_url().to_string())?;
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
            if let Some((message_id, chat_id, thread_id)) = delivery_coordinates(&ctx, &body) {
                if let Err(e) = nutrition_records::set_telegram_delivery(
                    pool,
                    &record.id,
                    message_id,
                    &chat_id,
                    thread_id.as_deref(),
                    &ctx.bot_id,
                )
                .await
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

    let Some(ctx) = load_stored_context(
        pool,
        record.pet_id,
        record.telegram_chat_id.as_deref(),
        record.telegram_thread_id.as_deref(),
        record.telegram_bot_id.as_deref(),
    )
    .await
    else {
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

    let Some(ctx) = load_stored_context(
        pool,
        record.pet_id,
        record.telegram_chat_id.as_deref(),
        record.telegram_thread_id.as_deref(),
        record.telegram_bot_id.as_deref(),
    )
    .await
    else {
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

    async fn pool() -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::run_migrations(&pool).await.unwrap();
        pool
    }

    async fn pet(pool: &sqlx::SqlitePool) -> crate::domain::pet::Pet {
        let pet = crate::domain::pet::Pet::new(
            serde_json::from_value(serde_json::json!({"name":"Pet","species":"cat"})).unwrap(),
        );
        crate::repo::pets::create_pet(pool, pet).await.unwrap()
    }

    async fn intake(
        pool: &sqlx::SqlitePool,
        pet_id: uuid::Uuid,
    ) -> crate::domain::medication::MedIntakeRecord {
        let med = crate::repo::medications::create(
            pool,
            serde_json::from_value(
                serde_json::json!({"pet_id":pet_id,"name":"Dose","med_type":"pill"}),
            )
            .unwrap(),
        )
        .await
        .unwrap();
        let assignment = crate::repo::med_assignments::create(pool, serde_json::from_value(serde_json::json!({"medication_id":med.id,"tablet_strength_mg":10,"pill_shape":"round","dose_fraction":"whole","date_from":"2026-01-01"})).unwrap()).await.unwrap();
        crate::repo::med_intake_records::create(pool, serde_json::from_value(serde_json::json!({"pet_id":pet_id,"medication_id":med.id,"assignment_id":assignment.id,"occurred_at":"2026-09-19T10:00:00Z","local_date":"2026-09-19"})).unwrap(), chrono_tz::UTC).await.unwrap()
    }

    #[tokio::test]
    async fn delayed_intake_displays_the_resource_timezone() {
        let pool = pool().await;
        let pet = pet(&pool).await;
        let record = intake(&pool, pet.id).await;
        let context = crate::embedding::ServiceContext::standalone(pool, chrono_tz::Asia::Tokyo);
        assert_eq!(
            super::medication_display_time(&context, &record)
                .await
                .as_deref(),
            Some("2026-09-19T19:00:00")
        );
        let text = super::format_records_as_medication_text(
            &context,
            &[record],
            true,
            &crate::domain::user_settings::UserDisplaySettings::default(),
        )
        .await
        .unwrap();
        assert!(text.contains("19:00"), "{text}");
    }

    #[tokio::test]
    async fn shared_message_ids_never_mix_chats_bots_threads_or_pets() {
        let pool = pool().await;
        let alice = pet(&pool).await;
        let bob = pet(&pool).await;
        let target = intake(&pool, alice.id).await;
        crate::repo::med_intake_records::set_telegram_delivery(
            &pool,
            &target.id,
            42,
            "-100",
            Some("7"),
            "123",
        )
        .await
        .unwrap();
        let target = crate::repo::med_intake_records::get(&pool, &target.id)
            .await
            .unwrap();
        for (pet, bot, chat, thread) in [
            (alice.id, "123", "-200", Some("7")),
            (bob.id, "123", "-100", Some("7")),
            (alice.id, "456", "-100", Some("7")),
            (alice.id, "123", "-100", Some("8")),
            (alice.id, "123", "-100", None),
        ] {
            let record = intake(&pool, pet).await;
            crate::repo::med_intake_records::set_telegram_delivery(
                &pool, &record.id, 42, chat, thread, bot,
            )
            .await
            .unwrap();
        }
        let own_bundle_member = intake(&pool, alice.id).await;
        crate::repo::med_intake_records::set_telegram_delivery(
            &pool,
            &own_bundle_member.id,
            42,
            "-100",
            Some("7"),
            "123",
        )
        .await
        .unwrap();
        crate::repo::med_intake_records::delete(&pool, &target.id)
            .await
            .unwrap();
        let remaining = crate::repo::med_intake_records::list_by_telegram_delivery(&pool, &target)
            .await
            .unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, own_bundle_member.id);
    }

    #[tokio::test]
    async fn edits_use_original_destination_and_refuse_unknown_legacy_or_changed_bot() {
        let pool = pool().await;
        let pet = pet(&pool).await;
        crate::repo::settings::upsert(
            &pool,
            "telegram",
            &crate::domain::settings::TelegramConfig {
                enabled: true,
                bot_token: Some("123:rotated-secret".into()),
            },
        )
        .await
        .unwrap();
        crate::repo::pets::update_pet(
            &pool,
            pet.id,
            serde_json::from_value(
                serde_json::json!({"telegram_meds_chat_id":"-999","telegram_meds_thread_id":"88"}),
            )
            .unwrap(),
        )
        .await
        .unwrap();
        let ctx = super::load_stored_context(&pool, pet.id, Some("-100"), Some("7"), Some("123"))
            .await
            .unwrap();
        assert_eq!(ctx.chat_id, "-100");
        assert_eq!(ctx.thread_id.as_deref(), Some("7"));
        assert!(super::load_stored_context(&pool, pet.id, None, None, None)
            .await
            .is_none());
        assert!(
            super::load_stored_context(&pool, pet.id, Some("-100"), None, Some("456"))
                .await
                .is_none()
        );
        let coordinates = super::delivery_coordinates(&ctx, &serde_json::json!({"result":{"message_id":42,"chat":{"id":-100},"message_thread_id":7}})).unwrap();
        assert_eq!(coordinates, (42, "-100".into(), Some("7".into())));
        assert!(super::delivery_coordinates(
            &ctx,
            &serde_json::json!({"result":{"message_id":42}})
        )
        .is_none());
    }

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
