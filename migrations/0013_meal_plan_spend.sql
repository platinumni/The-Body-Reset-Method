-- What members planned to spend, usually spend, and actually paid, week by week.
-- Used for their own savings total, to tune their price estimates, and (anonymous totals only) for marketing figures.
CREATE TABLE meal_plan_spend (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  planned_pence INTEGER NOT NULL CHECK (planned_pence >= 0),
  usual_pence   INTEGER CHECK (usual_pence >= 0),
  actual_pence  INTEGER NOT NULL CHECK (actual_pence >= 0),
  currency      TEXT NOT NULL DEFAULT 'gbp',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_meal_plan_spend_user ON meal_plan_spend(user_id, id);
