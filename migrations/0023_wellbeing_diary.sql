-- Team wellbeing, stage 2: a private daily mood check-in, a private diary, and a simple planner (calendar).
-- All of it belongs to the employee alone. Their employer never sees any of it, not even as totals.
-- Diary text is encrypted at rest (AES-GCM with the ADMIN_ENC_KEY secret).

CREATE TABLE wellbeing_checkins (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  day        TEXT NOT NULL,                          -- YYYY-MM-DD, UK date
  mood       INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE wellbeing_diary (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  day        TEXT NOT NULL,
  body_enc   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_wellbeing_diary_user ON wellbeing_diary(user_id, day);

CREATE TABLE wellbeing_plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  day        TEXT NOT NULL,
  time       TEXT,                                   -- HH:MM, optional
  kind       TEXT NOT NULL CHECK (kind IN ('session', 'course', 'meal', 'other')),
  title      TEXT NOT NULL,
  done_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_wellbeing_plans_user ON wellbeing_plans(user_id, day);
