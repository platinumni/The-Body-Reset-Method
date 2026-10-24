-- Contact form messages. Kept so nothing is lost before an email address is set up.
CREATE TABLE contact_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL COLLATE NOCASE,
  message      TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'not-sent' CHECK (email_status IN ('not-sent', 'sent', 'failed', 'skipped')),
  handled_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contact_messages_email ON contact_messages(email);
