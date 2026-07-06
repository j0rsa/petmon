-- Daily schedule targets are derived from per-window min/max amounts; drop stored copies.
-- Remove legacy array-shaped schedule rules.
DELETE FROM nutrition_schedules WHERE json_type(rules_json) = 'array';

UPDATE nutrition_schedules
SET rules_json = json_remove(
    json_remove(
        json_remove(
            json_remove(rules_json, '$.target_min'),
            '$.target_max'),
        '$.target_min_ml'),
    '$.target_max_ml')
WHERE json_type(rules_json) = 'object'
  AND (
    json_extract(rules_json, '$.target_min') IS NOT NULL
    OR json_extract(rules_json, '$.target_max') IS NOT NULL
    OR json_extract(rules_json, '$.target_min_ml') IS NOT NULL
    OR json_extract(rules_json, '$.target_max_ml') IS NOT NULL
  );
