CREATE TABLE IF NOT EXISTS user_settings (
    reader_key  TEXT NOT NULL,
    key         TEXT NOT NULL,
    value_json  TEXT NOT NULL DEFAULT '{}',
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (reader_key, key)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_reader_key ON user_settings (reader_key);
