CREATE TABLE instance_admins (
    subject TEXT PRIMARY KEY NOT NULL,
    granted_at TEXT NOT NULL,
    revoked_at TEXT
);

-- A durable marker prevents environment bootstrap from reviving revoked roles.
CREATE TABLE instance_admin_bootstrap (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    initialized_at TEXT NOT NULL
);
