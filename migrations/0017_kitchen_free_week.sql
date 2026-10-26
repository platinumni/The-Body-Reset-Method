-- Body Regeneration Kitchen free week: email only, no card. One per email address.
-- Stores the choices and which recipes were picked, never allergies (special-category data).
CREATE TABLE kitchen_trials (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  token_hash       TEXT NOT NULL UNIQUE,
  inputs_json      TEXT NOT NULL,
  picks            TEXT NOT NULL,
  weekly_pence     INTEGER NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  ge_ref           TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at      TEXT,
  followup_sent_at TEXT
);
