-- Budget meal plans: a product members can own, and their saved choices.
INSERT INTO products (slug, title, kind, status, sort_order) VALUES ('meal-plans', 'Budget Meal Plans', 'programme', 'draft', 3);

CREATE TABLE meal_plan_prefs (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  prefs_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
