CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    reader_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_reader_key
    ON push_subscriptions(reader_key);
