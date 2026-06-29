-- API token scopes (comma-separated list; 'all' = full access)
ALTER TABLE api_tokens ADD COLUMN scopes TEXT NOT NULL DEFAULT 'all';
