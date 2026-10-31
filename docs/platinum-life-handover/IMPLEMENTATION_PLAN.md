# Step-by-step integration plan (Platinum NI / Platinum Life on Cloudflare)

Times are realistic / worst case for a Claude Code session, excluding waiting for the owner. Follow Platinum NI's own CLAUDE.md, brief → "CH" → build workflow, staging first, and no live changes without the owner's go-ahead.

## Step 0: Inspect Platinum NI first (30-60 min)
Find and write down (in Platinum NI's handover docs):
- framework (Hono? something else?), JSX or templates, folder structure (views, routes, services, lib?);
- how users log in; the user table and id; the member dashboard layout and nav; how Platinum Life membership or access is checked;
- the D1 binding, migration system and lock, a settings table, the audit log, CSRF and rate-limit helpers, the admin area and roles;
- CSP, the PWA manifest and service worker (and its caching of HTML), design tokens and CSS, the print stylesheet;
- the test framework (Vitest + workers pool?), deploy scripts, staging URL, cron triggers, R2 buckets;
- data export and deletion functions; the privacy policy.

If it's **also Hono + JSX on Workers**, most files port almost unchanged. If not, port the pure `lib/` files verbatim and rewrite only the views and routes.

## Step 1: Bring in the pure engine and data (1-2 h / 0.5 day)
1. Get the source at pinned commit `b8904433fde2e951218c16c4a8696c0b5b41536c` from `platinumni/The-Body-Reset-Method` (read-only; e.g. `add_repo` with read access, then `git show <commit>:<path>`). Do not modify that repo.
2. Copy to Platinum NI, e.g. `src/lib/platinum-life/meals/` and `content/platinum-life/meals/`:
   - `src/lib/meal-plans/{planner,prices,recipes,official}.ts`;
   - `content/meal-plans/{recipes,official-prices,official-sources,ons-price-quotes,photo-searches}.json` (empty `photo_rejects`);
   - optional: `recipe-catalogue-*.json`, `recipes/*.txt`, `scripts/build-recipes.mjs` + test.
3. Fix the import paths. Make sure `resolveJsonModule` is on, and that the JSON is bundled by wrangler (it is by default for `.json` imports).
4. Port `test/meal-plans-lib.test.ts` and `test/official-prices.test.ts` (and the build-recipes test). **Green before going on.**

## Step 2: Database (30 min)
Add one add-only migration with the `pl_meal_*` tables from SCHEMA.md, matched to Platinum NI's users table. Lock or record it per Platinum NI's rules. Apply on local and staging only.

## Step 3: Services (1-2 h)
Port `src/services/meal-plans.ts` → e.g. `src/services/platinum-life/meals.ts`:
- `readPlanInput`, `DEFAULT_PREFS`: verbatim;
- `canUseMealPlans` → **Platinum Life membership check** (or reuse Platinum NI's guard);
- prefs, spend, favourites → `pl_meal_*` tables;
- `official-prices.ts` → Platinum NI's settings table (key e.g. `pl.meal.official_prices`);
- `recipe-photos.ts` → `pl_meal_photos`, `pl_meal_photo_skips` (instead of `automation_sent`), R2 key `platinum-life/recipe-photos/<id>.jpg` in Platinum NI's media bucket, audit via Platinum NI.

## Step 4: Member pages inside the Platinum Life dashboard (0.5-1 day)
Routes (example base `/life/meals`; choose to fit Platinum Life's URL scheme):
- `GET /life/meals`: the planner (form, plan, menu or day view, shopping list, recipes, notes);
- `POST /life/meals/save`, `POST /life/meals/spend` (rate-limited), `POST /life/meals/favourite`;
- `GET /life/recipe-photos/:file`: public image route from R2 (or behind auth if Platinum NI prefers);
- port `mealQuery`/`MEAL_MULTI` and `planQuery` (change the base URL).

Views: port `src/views/meal-plans.tsx` into Platinum Life's layout and components:
- **rebrand** the print cover ("Platinum Life · Meal Plan"), headings and copy;
- use Platinum Life design tokens; mobile first, 16 px gutters, large tap targets; the shopping list works with one hand;
- keep every note (prices source, maintain weight, allergies, leftovers, babies, toddlers);
- port the meal-plan CSS and the `@media print` rules (cover page, hide `.no-print`).

Client script: port the household boxes, calorie estimate and print button from `reader.ts` into Platinum Life's external script.

Add a dashboard card or tile and nav item, "Meal planner" (or the owner's name for it).

## Step 5: PWA fit (1-2 h)
- The planner pages must render well in standalone display mode (no browser chrome: always show a back or home link).
- Service worker (if any): **never cache personalised HTML** for `/life/meals*`. Network-first or bypass. Cache static assets only.
- The print/PDF button works in standalone mode on iOS and Android (iOS opens the share sheet). Test both.
- Add a manifest shortcut to the planner if Platinum Life's manifest supports `shortcuts`.

## Step 6: Admin (2-4 h)
In Platinum NI admin (admin role, two-step login, audit): Meal photos (list, auto-pick, choose, remove, proxied previews), meal stats (anonymous savings) and "Refresh food prices now".

## Step 7: Scheduled jobs (30 min)
In Platinum NI's cron handler: the monthly price refresh (daily check, 25-day skip) and the photo auto-pick (paced, with a budget). Secrets: `PIXABAY_API_KEY` (a new key for Platinum Life if possible), optional `BLS_API_KEY`. Outbound hosts: ONS, StatCan, BLS, Pixabay.

## Step 8: Privacy, export, deletion, wording (1 h)
- Add the meal tables to export and deletion.
- Add a privacy policy section.
- Add the OGL attribution line.
- Keep the honest price wording and maintain-weight notes. No "AI".

## Step 9: Photos (ongoing, about a week of hourly runs, plus a person checking)
Run the auto-pick on staging. **Review every photo** (contact sheets help), add rejects, and re-pick. No launch with wrong-dish photos (owner's standard on Body Regen).

## Step 10: Tests, staging deploy, owner review, then live only on "GO"
Port the tests (TESTS.md), run Platinum NI's full check, deploy to staging, owner walkthrough on their phone, then production with the owner's explicit go-ahead.

**Total:** about 3-4 days of build, worst case 6, plus photo review.
