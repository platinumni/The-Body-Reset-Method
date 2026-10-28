-- Kitchen refer-a-friend. A Kitchen member shares their friend code; a friend joins with half off the joining fee.
-- 14 days after a friend joins (and hasn't been refunded or left), it counts: 1 friend = a year free, 2 = lifetime free
-- ("for as long as the Kitchen runs"), applied to the member's Stripe membership as a 100%-off discount.

CREATE TABLE kitchen_friend_codes (
  code       TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- The invite page says "A friend" unless the member chooses to show their first name.
  show_name  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Each friend counts once, ever.
CREATE TABLE kitchen_referrals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL REFERENCES kitchen_friend_codes(code),
  friend_email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'counted', 'cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  counted_at   TEXT
);
CREATE INDEX idx_kitchen_referrals_code ON kitchen_referrals(code);

CREATE TABLE kitchen_friend_rewards (
  email                  TEXT PRIMARY KEY COLLATE NOCASE,
  reward                 TEXT NOT NULL CHECK (reward IN ('year', 'lifetime')),
  stripe_subscription_id TEXT,
  granted_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE orders ADD COLUMN friend_code TEXT;
