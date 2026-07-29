CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link_path TEXT NOT NULL,
    link_hash TEXT,
    pet_id TEXT REFERENCES pets(id) ON DELETE SET NULL,
    pet_name TEXT,
    source_kind TEXT,
    source_id TEXT,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source
    ON notifications(source_kind, source_id)
    WHERE source_kind IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    reader_key TEXT NOT NULL,
    read_at TEXT NOT NULL,
    PRIMARY KEY (notification_id, reader_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_reader ON notification_reads(reader_key);
