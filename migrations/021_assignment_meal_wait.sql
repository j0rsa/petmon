ALTER TABLE med_assignments ADD COLUMN meal_wait_minutes INTEGER;
ALTER TABLE medications ADD COLUMN description TEXT;

CREATE TABLE IF NOT EXISTS pet_settings (
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (pet_id, key)
);
CREATE INDEX IF NOT EXISTS idx_pet_settings_key ON pet_settings(key);
