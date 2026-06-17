-- Telegram-imported records were stored with a trailing 'Z' (UTC marker) but the
-- times are local. Strip the 'Z' so they are treated as naive local timestamps,
-- consistent with how all other records are stored.
UPDATE nutrition_records
SET occurred_at = rtrim(occurred_at, 'Z')
WHERE source_type = 'telegram'
  AND occurred_at LIKE '%Z';
