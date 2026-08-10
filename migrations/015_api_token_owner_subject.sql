-- Stable OIDC subject of the user who created the token; used as reader_key for per-user state.
ALTER TABLE api_tokens ADD COLUMN owner_subject TEXT;
