-- Team wellbeing, stage 3: the employee's choice of daily words (a faith or belief, or none).
-- Religion or belief is special-category data: it's optional, only saved with the employee's explicit
-- consent (recorded in consents, kind 'belief_preference'), never shown to their employer, and removable any time.
CREATE TABLE wellbeing_prefs (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  tradition  TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
