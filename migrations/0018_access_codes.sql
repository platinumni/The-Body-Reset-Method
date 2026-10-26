-- Access codes. Partner codes: a club, gym, employer or charity pays monthly and its members
-- unlock access with the code. Beta codes: free access for testers, in exchange for honest feedback.
CREATE TABLE access_codes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind              TEXT NOT NULL CHECK (kind IN ('partner', 'beta')),
  label             TEXT NOT NULL,             -- organisation or tester group
  product_slugs     TEXT NOT NULL,             -- comma list of what the code unlocks
  max_uses          INTEGER,                   -- null = no limit
  uses              INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  monthly_fee_pence INTEGER,                   -- what the organisation pays (a note: invoiced separately)
  affiliate_id      INTEGER REFERENCES affiliates(id), -- optional: a partner who earns commission on later sales
  note              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at          TEXT
);

-- Each request to use a code. Access is only given once the person clicks the emailed link.
CREATE TABLE access_code_claims (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id    INTEGER NOT NULL REFERENCES access_codes(id),
  email      TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  consents   TEXT NOT NULL,
  ge_ref     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  order_id   INTEGER REFERENCES orders(id)
);
CREATE INDEX idx_code_claims_code ON access_code_claims(code_id, claimed_at);
CREATE INDEX idx_code_claims_email ON access_code_claims(email);
