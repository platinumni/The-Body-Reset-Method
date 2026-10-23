-- 0002_shop: products, orders, access rights, account invites, payment events, email log.
-- Add-only: never edit this file once committed.

-- Things that can be bought. A 'programme' grants itself; a 'bundle' grants the
-- programmes listed in bundle_items. price_pence NULL = not on sale yet.
CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'programme' CHECK (kind IN ('programme', 'bundle')),
  price_pence INTEGER CHECK (price_pence IS NULL OR price_pence > 0),
  currency    TEXT NOT NULL DEFAULT 'gbp',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'on_sale', 'archived')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE bundle_items (
  bundle_id  INTEGER NOT NULL REFERENCES products(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  PRIMARY KEY (bundle_id, product_id)
);

-- One checkout. Prices and titles are copied into order_items so history never changes.
CREATE TABLE orders (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id             TEXT NOT NULL UNIQUE,          -- random, safe to show in URLs
  email                 TEXT COLLATE NOCASE,           -- filled from Stripe when paid
  name                  TEXT,
  country               TEXT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'expired')),
  total_pence           INTEGER NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'gbp',
  stripe_session_id     TEXT UNIQUE,
  stripe_payment_intent TEXT,
  ref_code              TEXT,                          -- affiliate referral (Step 6)
  consents_json         TEXT NOT NULL,                 -- tick boxes as shown at checkout
  marketing_opt_in      INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0, 1)),
  ip                    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at               TEXT,
  refunded_at           TEXT
);
CREATE INDEX idx_orders_email ON orders(email);

CREATE TABLE order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  title       TEXT NOT NULL,
  price_pence INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Who can open which programme. Granted by email at payment; linked to the
-- account once it's created. Revoked (never deleted) on refund.
CREATE TABLE entitlements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL COLLATE NOCASE,
  user_id    INTEGER REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),  -- always a programme, never a bundle
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  UNIQUE (order_id, product_id)
);
CREATE INDEX idx_entitlements_email ON entitlements(email);
CREATE INDEX idx_entitlements_user ON entitlements(user_id);

-- Single-use emailed links: 'setup' (create account after buying) and 'reset' (password reset).
CREATE TABLE email_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  purpose    TEXT NOT NULL CHECK (purpose IN ('setup', 'reset')),
  email      TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  order_id   INTEGER REFERENCES orders(id),
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stripe webhook events already processed (so a repeated delivery is ignored).
CREATE TABLE stripe_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every email the site sends (for the usage watch and troubleshooting).
CREATE TABLE email_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email    TEXT NOT NULL COLLATE NOCASE,
  template    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_id TEXT,
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_log_created ON email_log(created_at);

-- The programmes from the owner's list. No prices: they're set by the owner (admin, Step 5).
INSERT INTO products (slug, title, kind, status, sort_order) VALUES
  ('lower-body-regeneration', 'Lower Body Regeneration', 'programme', 'draft', 1),
  ('upper-body', 'Upper Body', 'programme', 'draft', 2),
  ('hips', 'Hips', 'programme', 'draft', 3),
  ('breathwork-regulation', 'Breathwork & Regulation', 'programme', 'draft', 4),
  ('full-body', 'Full Body', 'programme', 'draft', 5),
  ('stretching', 'Stretching', 'programme', 'draft', 6);
