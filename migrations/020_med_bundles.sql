CREATE TABLE IF NOT EXISTS med_bundles (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_med_bundles_pet ON med_bundles(pet_id);

CREATE TABLE IF NOT EXISTS med_bundle_items (
    bundle_id TEXT NOT NULL REFERENCES med_bundles(id) ON DELETE CASCADE,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position IN (0, 1)),
    PRIMARY KEY (bundle_id, medication_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_med_bundle_items_position
    ON med_bundle_items(bundle_id, position);
