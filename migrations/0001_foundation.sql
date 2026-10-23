-- 0001_foundation: core tables for accounts, sessions, security and operations.
-- RULE: migrations are add-only. Never edit or delete this file once committed;
-- make a new numbered file instead. `npm run check` enforces this.

-- People with an account: customers (buyers) and admins (the owner).
CREATE TABLE users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name              TEXT,
  password_hash     TEXT,                       -- null until the account is set up from the email link
  role              TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  email_verified_at TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT                        -- soft delete; personal fields are wiped on erasure
);

-- Login sessions. Only a SHA-256 hash of the token is stored, never the token itself.
CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Fixed-window rate limiting (login attempts, form posts, etc.).
CREATE TABLE rate_limits (
  bucket       TEXT NOT NULL,
  window_start INTEGER NOT NULL,              -- unix seconds
  hits         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- Who did what in admin. Never edited or removed.
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id),
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  detail_json   TEXT,
  ip            TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- UK GDPR consent records: one row per grant or withdrawal, never overwritten.
CREATE TABLE consents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id),
  email           TEXT NOT NULL COLLATE NOCASE,
  kind            TEXT NOT NULL,              -- e.g. 'marketing_email', 'terms', 'health_declaration'
  granted         INTEGER NOT NULL CHECK (granted IN (0, 1)),
  wording_version TEXT NOT NULL,
  source          TEXT,                       -- page or flow where it was given
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_consents_email ON consents(email, kind);

-- Database backups written to R2.
CREATE TABLE backups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,                  -- 'weekly', 'manual', 'pre-deploy'
  r2_key      TEXT,
  size_bytes  INTEGER,
  table_count INTEGER,
  row_count   INTEGER,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'failed')),
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simple editable site settings (homepage wording etc.).
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
