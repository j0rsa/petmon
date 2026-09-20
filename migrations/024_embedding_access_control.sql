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
-- This is a pre-release hard switch for the only 0.25 instance: all naïve
-- values were entered in Berlin during CEST (UTC+2). Explicit-offset values
-- are already instants and are normalized without shifting them.
UPDATE nutrition_records
SET occurred_at = strftime('%Y-%m-%dT%H:%M:%S', occurred_at, '-2 hours') || '.000000000Z'
WHERE length(occurred_at) = 19;
UPDATE elimination_records
SET occurred_at = strftime('%Y-%m-%dT%H:%M:%S', occurred_at, '-2 hours') || '.000000000Z'
WHERE length(occurred_at) = 19;
UPDATE med_intake_records
SET occurred_at = strftime('%Y-%m-%dT%H:%M:%S', occurred_at, '-2 hours') || '.000000000Z'
WHERE length(occurred_at) = 19;
UPDATE health_records
SET occurred_at = strftime('%Y-%m-%dT%H:%M:%S', occurred_at, '-2 hours') || '.000000000Z'
WHERE length(occurred_at) = 19;
UPDATE weight_records
SET measured_at = strftime('%Y-%m-%dT%H:%M:%S', measured_at, '-2 hours') || '.000000000Z'
WHERE length(measured_at) = 19;

-- SQLite normalizes an explicit offset to UTC; retain the original fractional
-- precision rather than relying on SQLite's millisecond-only %f formatter.
UPDATE elimination_records
SET occurred_at = strftime('%Y-%m-%dT%H:%M:%S', occurred_at) || '.' ||
    CASE WHEN substr(occurred_at, 20, 1) = '.' THEN
        substr(
            substr(occurred_at, 21,
                CASE
                    WHEN instr(substr(occurred_at, 21), '+') > 0 THEN instr(substr(occurred_at, 21), '+') - 1
                    WHEN instr(substr(occurred_at, 21), '-') > 0 THEN instr(substr(occurred_at, 21), '-') - 1
                    WHEN instr(substr(occurred_at, 21), 'Z') > 0 THEN instr(substr(occurred_at, 21), 'Z') - 1
                    ELSE length(occurred_at) - 20
                END
            ) || '000000000', 1, 9
        )
    ELSE '000000000' END || 'Z'
WHERE length(occurred_at) <> 19;

-- Changed elapsed-time/hour features must not reuse models trained on civil arithmetic.
-- Keep only a lightweight pending-retrain tombstone; stale model payloads are discarded.
UPDATE elimination_classifiers
SET model_version = 0, model_json = '{}', sample_count = 0, trained_at = '', pending_retrain = 1
WHERE model_version <> 3;

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
