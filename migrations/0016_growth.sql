-- Growth engine reporting and email sequences.
-- "ge" is the campaign reference from a marketing link (?ge=CODE). It's carried in links and
-- forms (never a cookie) and saved with sign-ups and orders so results can be credited.
ALTER TABLE orders ADD COLUMN ge_ref TEXT;
ALTER TABLE orders ADD COLUMN access_code TEXT;
ALTER TABLE subscribers ADD COLUMN ge_ref TEXT;

-- Events reported to the growth engine. Sent straight away; anything that fails is retried daily.
-- No names or emails are ever stored or sent here.
CREATE TABLE engine_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('signup', 'lead', 'purchase', 'refund')),
  payload     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at     TEXT
);
CREATE INDEX idx_engine_events_status ON engine_events(status);

-- Short email series people sign up for (e.g. the 3-day Method taster). One row per person per series.
CREATE TABLE email_sequences (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL COLLATE NOCASE,
  sequence   TEXT NOT NULL,
  step       INTEGER NOT NULL DEFAULT 0,
  next_at    TEXT,
  stopped_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (email, sequence)
);
CREATE INDEX idx_email_sequences_next ON email_sequences(next_at);
