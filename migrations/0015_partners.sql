-- Partner (affiliate) upgrades: custom commission rates, 12 months of repeat-purchase commission,
-- and deductions when a paid-out sale is later refunded or charged back.
ALTER TABLE affiliates ADD COLUMN rate_percent REAL;
ALTER TABLE affiliates ADD COLUMN partner_note TEXT;

-- Which partner brought each customer, so repeat purchases within 12 months also earn.
CREATE TABLE referred_customers (
  email          TEXT PRIMARY KEY COLLATE NOCASE,
  affiliate_id   INTEGER NOT NULL REFERENCES affiliates(id),
  first_order_id INTEGER REFERENCES orders(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Commission already paid on a sale that was later refunded or charged back. Taken off the next payout.
CREATE TABLE commission_clawbacks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL REFERENCES affiliates(id),
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  reason       TEXT NOT NULL CHECK (reason IN ('refund', 'chargeback')),
  payout_id    INTEGER REFERENCES payouts(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (order_id)
);
CREATE INDEX idx_clawbacks_affiliate ON commission_clawbacks(affiliate_id, payout_id);
