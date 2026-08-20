CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    med_type TEXT NOT NULL CHECK (med_type IN ('pill', 'liquid')),
    pill_shape TEXT CHECK (pill_shape IN ('round_1_precut', 'round_2_precut', 'ellipse_1_precut')),
    pill_fraction TEXT CHECK (pill_fraction IN ('half', 'quarter', 'eighth', 'sixteenth')),
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_medications_pet ON medications(pet_id);

CREATE TABLE IF NOT EXISTS med_assignments (
    id TEXT PRIMARY KEY,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    dosage TEXT NOT NULL,
    frequency_json TEXT NOT NULL DEFAULT '{"times":[]}',
    date_from TEXT NOT NULL,
    date_to TEXT,
    optional INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_med_assignments_med ON med_assignments(medication_id, date_from);
CREATE INDEX IF NOT EXISTS idx_med_assignments_pet_dates ON med_assignments(pet_id, date_from, date_to);

CREATE TABLE IF NOT EXISTS med_intake_records (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    assignment_id TEXT REFERENCES med_assignments(id) ON DELETE SET NULL,
    occurred_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    dosage TEXT NOT NULL,
    taken INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_med_intake_pet_date ON med_intake_records(pet_id, local_date);
CREATE INDEX IF NOT EXISTS idx_med_intake_med_date ON med_intake_records(medication_id, local_date);
