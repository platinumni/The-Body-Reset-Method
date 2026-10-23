-- 0006_automation: email campaigns to opted-in members, and a record of automatic emails sent.
-- Add-only: never edit this file once committed.

-- A one-off email to everyone who has opted in to news (e.g. a new programme launch).
CREATE TABLE campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,                 -- same simple formatting as lessons
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent')),
  recipients  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at     TEXT
);

-- Who each campaign went to, so nobody ever gets the same campaign twice.
CREATE TABLE campaign_sends (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  email       TEXT NOT NULL COLLATE NOCASE,
  status      TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, email)
);

-- Automatic emails already sent (account-setup reminders, check-ins, alerts), so each goes once.
CREATE TABLE automation_sent (
  kind    TEXT NOT NULL,
  ref     TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, ref)
);
