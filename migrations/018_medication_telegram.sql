ALTER TABLE pets RENAME COLUMN telegram_chat_id TO telegram_nutrition_chat_id;
ALTER TABLE pets RENAME COLUMN telegram_thread_id TO telegram_nutrition_thread_id;
ALTER TABLE pets ADD COLUMN telegram_meds_chat_id TEXT;
ALTER TABLE pets ADD COLUMN telegram_meds_thread_id TEXT;
ALTER TABLE med_intake_records ADD COLUMN telegram_message_id INTEGER;
