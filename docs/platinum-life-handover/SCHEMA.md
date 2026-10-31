# Database schema

## Tables the Body Regen planner uses (verified, from `migrations/` at the pinned commit)

### Planner-owned tables
```sql
-- 0012_meal_plans.sql
CREATE TABLE meal_plan_prefs (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  prefs_json TEXT NOT NULL,          -- MealPrefs JSON (see below); never contains allergens
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 0013_meal_plan_spend.sql
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

-- 0019_subscriptions.sql (the planner part)
CREATE TABLE meal_plan_favourites (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  recipe_id  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id)
);

-- 0020_recipe_photos.sql
CREATE TABLE recipe_photos (
  recipe_id    TEXT PRIMARY KEY,
  r2_key       TEXT NOT NULL,
  source       TEXT NOT NULL,              -- 'pixabay'
  source_id    TEXT NOT NULL,
  page_url     TEXT NOT NULL,
  photographer TEXT,
  licence      TEXT NOT NULL,
  search       TEXT,
  chosen_by    TEXT NOT NULL CHECK (chosen_by IN ('auto', 'owner')),
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 0017_kitchen_free_week.sql (optional feature)
CREATE TABLE kitchen_trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, token_hash TEXT NOT NULL UNIQUE,
  inputs_json TEXT NOT NULL, picks TEXT NOT NULL, weekly_pence INTEGER NOT NULL, marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  ge_ref TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), verified_at TEXT, followup_sent_at TEXT
);
```

### Shared tables the planner touches (Body Regen's; map them to Platinum NI equivalents)
- `users(id, email, name, role 'customer'|'admin', deleted_at, …)`: the member.
- `products(slug 'meal-plans', …)` and `entitlements(user_id, product_id, revoked_at, …)`: access. **Replace with Platinum Life membership.**
- `settings(key PRIMARY KEY, value, updated_at)`: key `meal.official_prices` holds the refreshed `OfficialPrices` JSON.
- `automation_sent(kind, ref, PRIMARY KEY(kind, ref))`: `kind='photo-no-match'`, `ref=<recipe id>` marks recipes the auto-picker found nothing for.
- `audit_log` (via `recordAudit`): admin photo choices and price refreshes.
- `consents`: free-week news opt-in only.

### `prefs_json` shape (`MealPrefs`)
```json
{ "budget": 40, "country": "uk", "store": "mid", "adults": 1, "childAges": [], "diet": "any",
  "exclude": [], "avoidAllergens": [], "snacks": true, "have": [], "usual": null,
  "region": "national", "styles": [], "adultSizes": [] }
```
`avoidAllergens` is always saved as `[]` (allergies are health data and never stored).

### Not tables: recipes and prices
Recipes (`content/meal-plans/recipes.json`) and price items (`src/lib/meal-plans/prices.ts`) are **bundled code and data, not database rows**. Changing a recipe means a rebuild and redeploy. Keep it that way at first: it's fast, free and testable.

## Proposed Platinum Life schema

Prefix everything so it can't collide with Platinum NI tables. Adjust `REFERENCES` to Platinum NI's real users table (**not verified**). Name: `pl_meal_*`. One new add-only migration in Platinum NI's migration system:

```sql
-- NNNN_platinum_life_meal_planner.sql
CREATE TABLE pl_meal_prefs (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),   -- Platinum NI user id (check the real table and column)
  prefs_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE pl_meal_spend (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  planned_pence INTEGER NOT NULL CHECK (planned_pence >= 0),
  usual_pence   INTEGER CHECK (usual_pence >= 0),
  actual_pence  INTEGER NOT NULL CHECK (actual_pence >= 0),
  currency      TEXT NOT NULL DEFAULT 'gbp',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pl_meal_spend_user ON pl_meal_spend(user_id, id);
CREATE TABLE pl_meal_favourites (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  recipe_id  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id)
);
CREATE TABLE pl_meal_photos (
  recipe_id TEXT PRIMARY KEY, r2_key TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT NOT NULL,
  page_url TEXT NOT NULL, photographer TEXT, licence TEXT NOT NULL, search TEXT,
  chosen_by TEXT NOT NULL CHECK (chosen_by IN ('auto', 'owner')), version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE pl_meal_photo_skips (recipe_id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')));
-- Only if Platinum NI has no key/value settings table:
CREATE TABLE pl_meal_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
```
Data export must include `pl_meal_prefs`, `pl_meal_spend` and `pl_meal_favourites` for the user. Account deletion must delete their rows from all three (Body Regen does this in `exportUserData` / `deleteAccount`).

**No data migration from Body Regen.** Platinum Life starts empty; members' Body Regen data is never copied (different controller and brand, and no consent for it).
