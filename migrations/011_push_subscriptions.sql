CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    reader_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    last_success_at TEXT,
    last_attempt_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_reader_key
    ON push_subscriptions(reader_key);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_attempt_at
    ON push_subscriptions(last_attempt_at);
