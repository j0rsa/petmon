-- Consolidated schema changes for the unreleased 0.26.0 release.
CREATE TABLE instance_admins (
    subject TEXT PRIMARY KEY NOT NULL,
    granted_at TEXT NOT NULL,
    revoked_at TEXT
);

-- A durable marker prevents environment bootstrap from reviving revoked roles.
CREATE TABLE instance_admin_bootstrap (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    initialized_at TEXT NOT NULL
);

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

-- occurred_at/measured_at now contain one canonical UTC RFC3339 instant.
-- No duplicate civil/UTC columns: local_date remains the independent journal day.
-- Legacy naive timestamps need an explicit historical timezone, unavailable to
-- SQL migrations. Startup refuses legacy rows until migrate-record-times succeeds.
-- Changed elapsed-time/hour features must not reuse models trained on civil arithmetic.
UPDATE elimination_classifiers SET pending_retrain = 1 WHERE model_version <> 3;

-- Acknowledging/dismissing an event must not reset reminder deduplication.
-- Deliberately no FK to notifications: delivery identity outlives inbox rows.
CREATE TABLE notification_delivery_claims (
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    PRIMARY KEY (source_kind, source_id)
);
INSERT INTO notification_delivery_claims (source_kind, source_id, claimed_at)
    SELECT source_kind, source_id, created_at FROM notifications
    WHERE source_kind IS NOT NULL AND source_id IS NOT NULL;
