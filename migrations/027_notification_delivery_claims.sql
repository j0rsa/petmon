-- Acknowledging/dismissing an event must not reset reminder deduplication.
-- Deliberately no FK to notifications: delivery identity outlives inbox rows.
CREATE TABLE notification_delivery_claims (
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    PRIMARY KEY (source_kind, source_id)
);
INSERT INTO notification_delivery_claims (source_kind, source_id, claimed_at)
    SELECT source_kind, source_id, created_at FROM notifications
    WHERE source_kind IS NOT NULL AND source_id IS NOT NULL;
