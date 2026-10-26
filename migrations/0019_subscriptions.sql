-- Monthly memberships (first: Body Regeneration Kitchen). price_pence is the joining fee,
-- monthly_pence the monthly price. A product with a monthly price is sold as a membership, not in the basket.
ALTER TABLE products ADD COLUMN monthly_pence INTEGER;

CREATE TABLE subscriptions (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  email                  TEXT NOT NULL COLLATE NOCASE,
  product_id             INTEGER NOT NULL REFERENCES products(id),
  first_order_id         INTEGER NOT NULL REFERENCES orders(id),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id     TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'ended')),
  cancel_at_period_end   INTEGER NOT NULL DEFAULT 0,
  current_period_end     TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at               TEXT
);
CREATE INDEX idx_subscriptions_email ON subscriptions(email);

-- Each monthly payment is recorded as its own paid order, so commission, refunds and reports work as for any sale.
ALTER TABLE orders ADD COLUMN subscription_id INTEGER REFERENCES subscriptions(id);

-- Recipes a member has starred. Plans include them where the budget allows.
CREATE TABLE meal_plan_favourites (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  recipe_id  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id)
);
