-- 0004_admin: two-step login for admin, change history (undo), site wording, anonymous stats.
-- Add-only: never edit this file once committed.

-- Authenticator-app secret per admin (encrypted with the ADMIN_ENC_KEY secret).
CREATE TABLE admin_mfa (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id),
  secret_encrypted TEXT NOT NULL,
  last_used_step   INTEGER NOT NULL DEFAULT 0,   -- stops the same 6-digit code being used twice
  enabled_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One-time backup codes (hashed), for when the phone isn't to hand.
CREATE TABLE admin_backup_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  code_hash  TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_backup_codes_user ON admin_backup_codes(user_id);

-- The step between "password correct" and "authenticator code correct" (5 minutes).
CREATE TABLE login_challenges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every saved version of editable things, so any change can be undone.
CREATE TABLE revisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT NOT NULL,                 -- 'lesson', 'product', 'setting'
  entity_id     TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,                 -- the version BEFORE the change
  note          TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_revisions_entity ON revisions(entity_type, entity_id, id);

-- Anonymous daily counters: page views and shop events. No cookies, no IP addresses.
CREATE TABLE daily_stats (
  day    TEXT NOT NULL,                        -- YYYY-MM-DD (UTC)
  metric TEXT NOT NULL,                        -- 'view', 'add_to_basket', 'checkout_started', ...
  path   TEXT NOT NULL DEFAULT '',
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric, path)
);

-- Admin pages require a session that passed the authenticator step, so a member
-- session can never open admin, even if that person is later made an admin.
ALTER TABLE sessions ADD COLUMN mfa_verified INTEGER NOT NULL DEFAULT 0;
