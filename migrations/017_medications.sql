CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    med_type TEXT NOT NULL CHECK (med_type IN ('pill', 'liquid')),
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_medications_pet ON medications(pet_id);

-- Physical tablet / liquid bottle identity (strength + pill shape). Immutable once created.
CREATE TABLE IF NOT EXISTS med_formulations (
    id TEXT PRIMARY KEY,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    tablet_strength_mg REAL,
    pill_shape TEXT CHECK (pill_shape IN (
        'freedom', 'oval', 'oval_rounded', 'square', 'capsule', 'pentagon', 'tear', 'rectangle',
        'hexagon', 'round', 'triangle', 'double_circle', 'trapezoid', 'octagon', 'diamond'
    )),
    liquid_concentration_mg_per_ml REAL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_med_formulations_med ON med_formulations(medication_id);

-- Treatment phase: which formulation, what fraction/volume, schedule. Immutable; ended via date_to or superseding row.
CREATE TABLE IF NOT EXISTS med_assignments (
    id TEXT PRIMARY KEY,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    formulation_id TEXT NOT NULL REFERENCES med_formulations(id) ON DELETE RESTRICT,
    dose_fraction TEXT CHECK (dose_fraction IN ('whole', 'half', 'third', 'quarter', 'three_quarter', 'eighth', 'sixteenth')),
    liquid_dose_ml REAL,
    frequency_json TEXT NOT NULL DEFAULT '{"morning":1,"midday":0,"evening":0,"every":1,"unit":"days"}',
    date_from TEXT NOT NULL,
    date_to TEXT,
    optional INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_med_assignments_med ON med_assignments(medication_id, date_from);
CREATE INDEX IF NOT EXISTS idx_med_assignments_pet_dates ON med_assignments(pet_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_med_assignments_formulation ON med_assignments(formulation_id);

-- Intake references assignment; optional overrides only when actual dose differed from plan.
CREATE TABLE IF NOT EXISTS med_intake_records (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    assignment_id TEXT NOT NULL REFERENCES med_assignments(id) ON DELETE RESTRICT,
    dose_fraction_override TEXT CHECK (dose_fraction_override IN ('whole', 'half', 'third', 'quarter', 'three_quarter', 'eighth', 'sixteenth')),
    liquid_dose_ml_override REAL,
    occurred_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    taken INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_med_intake_pet_date ON med_intake_records(pet_id, local_date);
CREATE INDEX IF NOT EXISTS idx_med_intake_assignment ON med_intake_records(assignment_id);
