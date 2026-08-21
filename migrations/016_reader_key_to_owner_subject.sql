-- Remap per-user rows keyed as api_token:{id} onto the token owner's OIDC sub.
-- Tokens without owner_subject cannot be mapped; those leftover rows are deleted.
-- Requires api_tokens.owner_subject to be populated before this migration runs.

INSERT INTO user_settings (reader_key, key, value_json, updated_at)
SELECT t.owner_subject, s.key, s.value_json, s.updated_at
FROM user_settings s
JOIN api_tokens t ON s.reader_key = 'api_token:' || t.id
WHERE t.owner_subject IS NOT NULL AND t.owner_subject != ''
ON CONFLICT(reader_key, key) DO UPDATE SET
    value_json = CASE
        WHEN excluded.updated_at > user_settings.updated_at THEN excluded.value_json
        ELSE user_settings.value_json
    END,
    updated_at = CASE
        WHEN excluded.updated_at > user_settings.updated_at THEN excluded.updated_at
        ELSE user_settings.updated_at
    END;

DELETE FROM user_settings WHERE reader_key LIKE 'api_token:%';

INSERT INTO notification_reads (notification_id, reader_key, read_at)
SELECT r.notification_id, t.owner_subject, r.read_at
FROM notification_reads r
JOIN api_tokens t ON r.reader_key = 'api_token:' || t.id
WHERE t.owner_subject IS NOT NULL AND t.owner_subject != ''
ON CONFLICT(notification_id, reader_key) DO UPDATE SET
    read_at = CASE
        WHEN excluded.read_at < notification_reads.read_at THEN excluded.read_at
        ELSE notification_reads.read_at
    END;

DELETE FROM notification_reads WHERE reader_key LIKE 'api_token:%';

UPDATE push_subscriptions
SET reader_key = (
    SELECT t.owner_subject
    FROM api_tokens t
    WHERE push_subscriptions.reader_key = 'api_token:' || t.id
      AND t.owner_subject IS NOT NULL
      AND t.owner_subject != ''
)
WHERE reader_key LIKE 'api_token:%'
  AND EXISTS (
    SELECT 1 FROM api_tokens t
    WHERE push_subscriptions.reader_key = 'api_token:' || t.id
      AND t.owner_subject IS NOT NULL
      AND t.owner_subject != ''
  );

DELETE FROM push_subscriptions WHERE reader_key LIKE 'api_token:%';
