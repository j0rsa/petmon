-- occurred_at/measured_at now contain one canonical UTC RFC3339 instant.
-- No duplicate civil/UTC columns: local_date remains the independent journal day.
-- Legacy naive timestamps need an explicit historical timezone, unavailable to
-- SQL migrations. Startup refuses legacy rows until migrate-record-times succeeds.
-- Changed elapsed-time/hour features must not reuse models trained on civil arithmetic.
UPDATE elimination_classifiers SET pending_retrain = 1 WHERE model_version <> 2;
