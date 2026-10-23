-- 0003_members: programme content (lessons) and members' progress.
-- Add-only: never edit this file once committed.

-- A programme's content, split into the two tabs members see:
--   'full'  = the Full Programme (read first, a few times)
--   'quick' = the Quick Run-Through (key points)
-- Only 'published' lessons are shown to members. Edited in admin (Step 5).
CREATE TABLE programme_lessons (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(id),
  tab            TEXT NOT NULL CHECK (tab IN ('full', 'quick')),
  position       INTEGER NOT NULL DEFAULT 0,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL DEFAULT '',     -- simple formatting: ## headings, **bold**, - lists, > key points
  youtube_id     TEXT,                         -- shown in privacy-enhanced mode
  image_key      TEXT,                         -- R2 key of an uploaded image
  image_alt      TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lessons_product ON programme_lessons(product_id, tab, position);

-- Ticks members put against lessons they've done.
CREATE TABLE lesson_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id),
  lesson_id    INTEGER NOT NULL REFERENCES programme_lessons(id),
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lesson_id)
);
