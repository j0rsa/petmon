-- Backfill groups_claim default ("groups") on any existing OIDC config row.
-- full_access_group and readonly_group default to NULL (no group restriction).
UPDATE app_settings
SET value_json = json_set(
    value_json,
    '$.groups_claim',      'groups',
    '$.full_access_group', NULL,
    '$.readonly_group',    NULL
)
WHERE key = 'oidc'
  AND json_extract(value_json, '$.groups_claim') IS NULL;
