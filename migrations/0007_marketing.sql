-- 0007_marketing: email sign-ups (double opt-in) and discount-code support on orders.
-- Add-only: never edit this file once committed.

-- People who signed up for news from the website (not necessarily customers).
-- 'pending' until they click the confirmation link in their email.
CREATE TABLE subscribers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  token_hash   TEXT,
  source       TEXT,                       -- 'popup', 'inline-home', 'inline-programme', ...
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);

-- What the customer actually paid after any discount code (total_pence is the price before discount).
ALTER TABLE orders ADD COLUMN amount_paid_pence INTEGER;
