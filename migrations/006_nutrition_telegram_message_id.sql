-- Store the Telegram message ID for nutrition records so edits can update the chat.
ALTER TABLE nutrition_records ADD COLUMN telegram_message_id INTEGER;
