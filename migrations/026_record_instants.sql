-- Keep legacy civil snapshots unchanged. Historical source timezone is unknown;
-- only an explicit operator backfill may populate canonical instants for them.
ALTER TABLE nutrition_records ADD COLUMN occurred_at_utc TEXT;
ALTER TABLE nutrition_records ADD COLUMN source_timezone TEXT;
ALTER TABLE elimination_records ADD COLUMN occurred_at_utc TEXT;
ALTER TABLE elimination_records ADD COLUMN source_timezone TEXT;
ALTER TABLE med_intake_records ADD COLUMN occurred_at_utc TEXT;
ALTER TABLE med_intake_records ADD COLUMN source_timezone TEXT;
ALTER TABLE health_records ADD COLUMN occurred_at_utc TEXT;
ALTER TABLE health_records ADD COLUMN source_timezone TEXT;
ALTER TABLE weight_records ADD COLUMN measured_at_utc TEXT;
ALTER TABLE weight_records ADD COLUMN source_timezone TEXT;
