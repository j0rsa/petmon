-- pets table
CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    species TEXT NOT NULL DEFAULT 'other',
    status TEXT NOT NULL DEFAULT 'alive',
    weight_kg REAL,
    feeding_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- nutrition pillar records
CREATE TABLE IF NOT EXISTS nutrition_records (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT,
    note TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- elimination pillar records (schema will evolve with the feature)
CREATE TABLE IF NOT EXISTS elimination_records (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    event_type TEXT NOT NULL,
    note TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- health pillar records (schema will evolve with the feature)
CREATE TABLE IF NOT EXISTS health_records (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    record_type TEXT NOT NULL,
    note TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    source_type TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- day_notes table
CREATE TABLE IF NOT EXISTS day_notes (
    id TEXT PRIMARY KEY,
    pet_id TEXT REFERENCES pets(id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(pet_id, local_date)
);

-- nutrition feeding schedules
CREATE TABLE IF NOT EXISTS nutrition_schedules (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    rules_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nutrition_records_pet_date ON nutrition_records(pet_id, local_date);
CREATE INDEX IF NOT EXISTS idx_nutrition_records_local_date ON nutrition_records(local_date);
CREATE INDEX IF NOT EXISTS idx_elimination_records_pet_date ON elimination_records(pet_id, local_date);
CREATE INDEX IF NOT EXISTS idx_health_records_pet_date ON health_records(pet_id, local_date);
CREATE INDEX IF NOT EXISTS idx_nutrition_schedules_pet ON nutrition_schedules(pet_id);
