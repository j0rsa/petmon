ALTER TABLE elimination_records ADD COLUMN duration_seconds INTEGER;
ALTER TABLE elimination_records ADD COLUMN subtype TEXT;

CREATE TABLE IF NOT EXISTS weight_records (
    id          TEXT PRIMARY KEY,
    pet_id      TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    measured_at TEXT NOT NULL,
    local_date  TEXT NOT NULL,
    weight_kg   REAL NOT NULL,
    note        TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weight_records_pet_date ON weight_records(pet_id, local_date);
