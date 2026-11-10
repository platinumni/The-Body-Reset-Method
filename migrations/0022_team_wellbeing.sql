-- Team wellbeing (business package, stage 1). Employees get access through their business's code
-- (access_codes unlock product 'teams'), and see a dashboard: today's follow-along session, their courses,
-- the meal planner, and charts of what they've done. The business only ever sees totals.
INSERT INTO products (slug, title, kind, status, sort_order) VALUES ('teams', 'Team wellbeing', 'programme', 'draft', 10);

-- Sessions an employee has done (a follow-along session from the dashboard). Never shown to their employer one by one.
CREATE TABLE wellbeing_activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL CHECK (kind IN ('session')),
  ref        TEXT NOT NULL,              -- which session (e.g. 'short-foot')
  minutes    INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 180),
  day        TEXT NOT NULL,              -- YYYY-MM-DD (UK date), one per session per day
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, ref, day)
);
CREATE INDEX idx_wellbeing_activity_user ON wellbeing_activity(user_id, day);
