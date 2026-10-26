-- Member reviews. Only published with the member's permission and after the owner checks them.
-- Genuine negative reviews must be published too (UK consumer law): reject only abuse, personal data or off-topic posts.
CREATE TABLE reviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  product_id   INTEGER REFERENCES products(id),
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         TEXT NOT NULL,
  display_name TEXT NOT NULL,
  may_publish  INTEGER NOT NULL DEFAULT 0 CHECK (may_publish IN (0, 1)),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  moderated_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reviews_status ON reviews(status, product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
