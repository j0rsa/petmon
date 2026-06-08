-- cats table
CREATE TABLE IF NOT EXISTS cats (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    weight_kg REAL,
    feeding_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- import_batches table
CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    parse_summary_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    committed_at TEXT
);

-- entries table
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    cat_id TEXT NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT,
    note TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',
    import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- day_notes table
CREATE TABLE IF NOT EXISTS day_notes (
    id TEXT PRIMARY KEY,
    cat_id TEXT REFERENCES cats(id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(cat_id, local_date)
);

-- schedules table
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    cat_id TEXT NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    rules_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_cat_date ON entries(cat_id, local_date);
CREATE INDEX IF NOT EXISTS idx_entries_local_date ON entries(local_date);
CREATE INDEX IF NOT EXISTS idx_entries_import_batch ON entries(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_schedules_cat ON schedules(cat_id);
