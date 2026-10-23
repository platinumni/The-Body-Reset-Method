-- 0005_affiliates: customers' share links, referral clicks, commission and payouts.
-- One level only: commission is earned on sales from your own link, never on anyone else's.
-- Add-only: never edit this file once committed.

CREATE TABLE affiliates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id),
  code          TEXT NOT NULL UNIQUE,              -- used in share links: /r/CODE
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  payout_email  TEXT,                              -- where to send commission (e.g. their PayPal email)
  terms_version TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Anonymous click counts per link per day (no cookies, no IPs).
CREATE TABLE affiliate_clicks (
  affiliate_id INTEGER NOT NULL REFERENCES affiliates(id),
  day          TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (affiliate_id, day)
);

-- A payment the owner made to an affiliate (by PayPal or bank transfer).
CREATE TABLE payouts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id  INTEGER NOT NULL REFERENCES affiliates(id),
  amount_pence  INTEGER NOT NULL,
  method        TEXT NOT NULL,
  reference     TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Commission on one order. Held as 'pending' until the refund window passes,
-- then 'approved' (owed), then 'paid' once included in a payout. Refunds cancel it.
CREATE TABLE commissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL REFERENCES affiliates(id),
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  rate_percent REAL NOT NULL,
  amount_pence INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  available_at TEXT NOT NULL,
  payout_id    INTEGER REFERENCES payouts(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (order_id)
);
CREATE INDEX idx_commissions_affiliate ON commissions(affiliate_id, status);
