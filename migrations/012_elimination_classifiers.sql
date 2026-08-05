CREATE TABLE elimination_classifiers (
    pet_id              BLOB PRIMARY KEY REFERENCES pets(id) ON DELETE CASCADE,
    model_version       INTEGER NOT NULL DEFAULT 1,
    model_json          TEXT NOT NULL,
    sample_count        INTEGER NOT NULL DEFAULT 0,
    trained_at          TEXT NOT NULL,
    pending_retrain     INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE INDEX idx_elimination_classifiers_pending
    ON elimination_classifiers(pending_retrain) WHERE pending_retrain = 1;
