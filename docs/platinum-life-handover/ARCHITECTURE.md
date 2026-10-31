# Architecture

## Stack (verified)
- **Runtime:** Cloudflare Workers (`compatibility_date` 2026-10-01, `nodejs_compat`). One Worker per environment (`bodyregen-staging`; production not created yet).
- **Framework:** [Hono](https://hono.dev) `^4.13` with server-rendered **JSX** (`hono/jsx`), no React and no client framework.
- **Language:** TypeScript (`tsc` 7, strict), ES modules.
- **Database:** Cloudflare **D1** (SQLite), binding `DB`. Add-only numbered migrations in `migrations/`, guarded by `scripts/check-migrations.mjs` and `migrations.lock.json`.
- **Storage:** Cloudflare **R2**: `MEDIA` (recipe photos at `recipe-photos/<id>.jpg`) and `BACKUPS`.
- **Scheduled jobs:** Worker crons: daily `0 6 * * *`, weekly `0 3 * * SUN`, temporary hourly photo job `5 * * * *`.
- **Client JS:** two small hand-written scripts served from the Worker (`/app.js`, `/reader.js`). The planner uses `/reader.js` (household boxes, calorie estimate, print button). No inline scripts (strict CSP).
- **Tests:** Vitest 4 with `@cloudflare/vitest-plugin` (tests run inside workerd with a real local D1), plus `node --test` for scripts. `npm run check` = `tsc` + migration check + script tests + Vitest.
- **Deploy:** `scripts/deploy.sh` runs checks, backs up D1 to R2, migrates, deploys, then a health check.
- **Runtime dependencies:** only `hono` and `uqr` (QR codes, not used by the planner). **The planner needs nothing but Hono.**

## How the planner is layered
```
src/lib/meal-plans/       PURE (no DB, no fetch except official.ts fetchers): the whole planning engine
  recipes.ts              loads content/meal-plans/recipes.json; Recipe type; ALLERGEN_LABELS
  prices.ts               219 PriceItems (regex → pack price/size/unit/aisle/cupboard), parseAmount(), usage()
  planner.ts              buildPlan(), shoppingList(), suits(), portions, food style, variety, leftovers, weekSeed(), money()
  official.ts             official price book: bundled JSON, priceBook(), regionsFor(), fetchUk/Ca/Us(), formatPeriod()
src/services/             ALL database access
  meal-plans.ts           access check, readPlanInput() (input cleaning), prefs load/save, spend log/summary, favourites
  official-prices.ts      loadOfficialPrices() from settings or bundled; refreshOfficialPrices() (monthly)
  recipe-photos.ts        Pixabay search/auto-pick, R2 copy, recipe_photos table, photoUrls()
  kitchen-trials.ts       free week (optional)
src/routes/account.tsx    GET /account/meal-plans; POST …/save, …/spend, …/favourite
src/routes/kitchen.tsx    free week, /recipe-photos/:file (public image route), Kitchen join (drop)
src/routes/admin.tsx      /admin/photos*, /admin/stats, /admin/meal-prices/refresh
src/views/meal-plans.tsx  planner page: form, HouseholdFields, FoodStyleField, WeekMenu, RecipeCard, Notes, shopping list, planQuery()
src/views/kitchen*.tsx    public Kitchen pages (adapt or drop)
src/views/admin/photos.tsx  admin photo pages
src/assets/reader.ts      client script (household boxes, calorie estimate, print)
src/assets/styles.css     includes meal-plan and print styles (search for .meal-, .recipe-, .shopping, .print-cover, .week, .plan-)
content/meal-plans/       DATA: recipes.json (built), price data JSON, photo searches, recipe sources
scripts/                  build-recipes.mjs (+test), fetch-official-prices.mjs, build-ons-quotes.mjs
```

## File-by-file: what to copy, adapt or leave

| File (at pinned commit) | Action | Notes |
|---|---|---|
| `src/lib/meal-plans/planner.ts` | **Copy verbatim** | Pure. Only change: `COUNTRIES[*].source` wording if wanted. |
| `src/lib/meal-plans/prices.ts` | **Copy verbatim** | Price items are estimates "October 2026". |
| `src/lib/meal-plans/recipes.ts` | **Copy**, fix the JSON import path | |
| `src/lib/meal-plans/official.ts` | **Copy**, fix the JSON import paths | |
| `content/meal-plans/recipes.json` | **Copy** | 153 recipes, about 330 KB, bundled into the Worker |
| `content/meal-plans/official-prices.json`, `official-sources.json`, `ons-price-quotes.json` | **Copy** | Needed by `official.ts` |
| `content/meal-plans/photo-searches.json` | **Copy**, but **empty `photo_rejects`** | Rejects are Pixabay ids for Body Regen's picks; start fresh or keep (harmless) |
| `content/meal-plans/recipe-catalogue-*.json`, `recipes/batch-*.txt` | **Copy** if Platinum Life will edit recipes | Source for `scripts/build-recipes.mjs` |
| `scripts/build-recipes.mjs` + `.test.mjs` | **Copy** if recipes will be edited | Rebuilds recipes.json, auto-tags allergens, checks diet labels |
| `scripts/fetch-official-prices.mjs`, `scripts/build-ons-quotes.mjs` | Copy (optional) | Offline refresh tools; the Worker refreshes itself monthly |
| `src/services/meal-plans.ts` | **Adapt** | Replace `canUseMealPlans` (Body Regen entitlements) with Platinum Life membership; keep `readPlanInput` verbatim; table names per SCHEMA.md |
| `src/services/official-prices.ts` | **Adapt** | Uses a `settings` key/value table; use Platinum NI's equivalent or create `pl_meal_settings` |
| `src/services/recipe-photos.ts` | **Adapt** | Own R2 bucket/prefix, own table, own Pixabay key; audit via Platinum NI's audit log |
| `src/views/meal-plans.tsx` | **Adapt** | Rebrand (print cover says "The Body Regeneration Method"); use the Platinum Life layout, CSRF component and design tokens; change URLs |
| `src/assets/reader.ts` | **Adapt** | Copy only the meal-plan parts (household boxes, calorie calculator, `[data-print]`); drop text size, read-aloud, jump-to; rename the `brm_` localStorage key if kept |
| `src/assets/styles.css` | **Adapt** | Re-skin the meal-plan and print rules with Platinum Life tokens |
| `src/routes/account.tsx` (meal-plan routes, `mealQuery`, `MEAL_MULTI`) | **Adapt** | Into Platinum Life's member dashboard routes |
| `src/routes/admin.tsx` (photos, stats, price refresh) | **Adapt** | Into Platinum NI admin |
| `src/views/admin/photos.tsx` | Adapt | |
| `src/views/kitchen.tsx`, `kitchen-free-week.tsx`, `services/kitchen-trials.ts` | Optional | Only if a public page or free taster is wanted |
| `src/services/subscriptions.ts`, `kitchen-friends.ts`, `payments/stripe.ts` (membership bits), `access-codes.ts`, `growth-engine.ts` | **Do not copy** | Body Regen sales machinery |
| Tests: `test/meal-plans-lib.test.ts`, `test/official-prices.test.ts`, `test/meal-plans.test.tsx`, `test/recipe-photos.test.tsx`, `scripts/build-recipes.test.mjs` | **Port** | See TESTS.md |

## Request flow (planner page)
1. Auth middleware sets `user` (Body Regen: session cookie → SHA-256 token lookup). In Platinum Life, use its own.
2. Access check. Body Regen: `entitlements` row for product slug `meal-plans`, or an admin.
3. `loadPrefs()` → defaults; `spendSummary()` → personal factor; `loadOfficialPrices()` → price book.
4. Fill in `seed = weekSeed()` if missing; `readPlanInput(mealQuery(params), prefs)` cleans every field.
5. `buildPlan({...input, favourites, personalFactor, book: priceBook(prices, country, region)})`. This is pure and synchronous, typically a few ms. **Verify CPU time on the Workers plan** (not measured here).
6. Render JSX. The photo map comes from `photoUrls()` (a `recipe_id → /recipe-photos/<id>.jpg?v=N` record).

## Bindings and config the planner needs
| Binding / var | Purpose |
|---|---|
| `DB` (D1) | prefs, spend, favourites, photos, settings |
| R2 bucket (Body Regen: `MEDIA`) | recipe photos |
| `PIXABAY_API_KEY` (secret, optional) | photo search |
| `BLS_API_KEY` (secret, optional) | US official prices |
| Outbound fetch to `www.ons.gov.uk`, `www150.statcan.gc.ca`, `api.bls.gov`, `pixabay.com`, `cdn.pixabay.com` | price refresh and photos |
| A cron trigger | monthly price refresh (runs daily, skips if under 25 days old) and photo picking |
