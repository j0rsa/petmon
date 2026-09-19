-- Legacy message IDs have no trustworthy original destination. Leave context
-- NULL so old messages are never edited/deleted using current pet settings.
ALTER TABLE nutrition_records ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE nutrition_records ADD COLUMN telegram_thread_id TEXT;
ALTER TABLE nutrition_records ADD COLUMN telegram_bot_id TEXT;
ALTER TABLE med_intake_records ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE med_intake_records ADD COLUMN telegram_thread_id TEXT;
ALTER TABLE med_intake_records ADD COLUMN telegram_bot_id TEXT;
CREATE INDEX idx_med_intake_telegram_delivery ON med_intake_records
    (pet_id, telegram_bot_id, telegram_chat_id, telegram_message_id);
