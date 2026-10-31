# Master prompt: paste this into the Platinum NI Claude Code chat

Copy everything inside the box below.

```text
TASK: Build the Platinum Life meal planner. It's a rebuild of the budget meal planner from my other project, The Body Regeneration Method ("Body Regeneration Kitchen"), inside Platinum Life on my Platinum NI platform.

SOURCE (read-only, never change it):
- GitHub repo platinumni/The-Body-Reset-Method, branch claude/clever-dirac-1c0vll.
- Attach it with add_repo, read access only. Do NOT push, commit, open PRs or run wrangler against it.
- Copy code and data from commit b8904433fde2e951218c16c4a8696c0b5b41536c (use `git show <commit>:<path>`).
- First read the full handover in docs/platinum-life-handover/ on that branch, in this order: README.md, FEATURES.md, ARCHITECTURE.md, LOGIC.md, SCHEMA.md, SECURITY.md, LICENSING.md, ADMIN_AND_SERVICES.md, IMPLEMENTATION_PLAN.md, TESTS.md. They were written from the code and say what's verified and what isn't.

WHAT IT IS (summary; the docs have the detail):
- A member enters a weekly food budget (to the pound), country and region (UK/US/Canada), supermarket type, household (adults with portion sizes, one age per child), diet, foods to leave out, allergens and a food style.
- A pure TypeScript planner (no AI, no database) picks a week of breakfasts, lunches, evening meals and snacks from 153 bundled recipes, priced against 219 price items. It uses official ONS/StatCan/BLS averages where available, otherwise estimates.
- It does batch cooking with food-safe leftovers and freezing, and a shopping list: fresh food in whole packs, cupboard items pro rata, "already have" ticks, and a starter-cupboard cost.
- Also: swaps, shuffle, favourites, saved preferences (never allergies), PDF via print, a savings tracker that learns from what members actually paid, an optional calorie estimate worked out on the phone only, and full safety notes (maintain weight, allergies, Food Standards Agency leftovers, babies, toddlers).
- Admin: recipe photo picker (Pixabay, self-hosted in R2, licence recorded), anonymous savings stats, "refresh food prices now".
- Scheduled jobs: monthly official price refresh; photo auto-pick.

REQUIREMENTS:
1. Branded entirely as Platinum Life. No "Body Regeneration", "Kitchen", "BRM" or Body Regen domain anywhere, including the print cover, emails and storage keys.
2. A native part of the Platinum Life member dashboard: its layout, components, design tokens and navigation (add a "Meal planner" tile or nav item).
3. Use the existing Platinum Life user account and membership/access system. No second login and no copy of Body Regen's auth or Stripe membership. Admins can always open it.
4. Mobile first and beautiful as part of the Platinum Life PWA. The service worker must never cache personalised planner HTML. Print/PDF must work from the home-screen app on iPhone and Android.
5. Keep all the useful functionality listed in FEATURES.md marked KEEP or ADAPT. Leave out the DROP items (Kitchen Stripe membership, refer-a-friend, partner codes, growth engine, Body Regen reviews and affiliates) unless I ask.
6. Complete separation:
   - own D1 tables (pl_meal_*), own R2 prefix or bucket, own secrets (a new PIXABAY_API_KEY for Platinum Life if possible; optional BLS_API_KEY);
   - no connection to any bodyregen-* database, bucket, Worker or URL;
   - never touch bodyregen-* Cloudflare resources (we share one Cloudflare account);
   - no Body Regen member data is copied.
7. Recipe photos: pick fresh ones into Platinum Life's own storage (reusing content/meal-plans/photo-searches.json search terms is fine). A person must check every photo before launch.
8. Wording:
   - prices are "estimated, based on official shop prices, updated monthly", never "live";
   - add the Open Government Licence attribution for ONS data;
   - plans are maintain-weight, with no health claims;
   - never call it AI (it's rule-based).
9. Security:
   - CSRF on every POST; rate-limit the spend log;
   - allergies never stored; calorie inputs never submitted;
   - meal tables in data export and account deletion; privacy policy section added.
10. Preserve The Body Regeneration Method project completely unchanged.

HOW TO WORK:
- First, inspect THIS (Platinum NI) repo and its CLAUDE.md/handover. Write down the framework, auth and membership check, user table, D1 and migrations, CSP, PWA/service worker, design system, admin, cron, tests and deploy.
- Anything in the handover marked "not verified" about Platinum NI is a guess: check it.
- Then send me a short brief: your plan mapped to what you found, times (realistic and worst case), and any decisions I need to make, such as URL path, name in the nav, which membership tier gets it, and whether to include the free taster.
- Wait for my "CH". Then follow IMPLEMENTATION_PLAN.md:
  - copy the pure engine (src/lib/meal-plans/*.ts) and data (content/meal-plans/*.json) verbatim, fixing only import paths;
  - port the tests first and get them green;
  - add one add-only migration;
  - port the services, then the pages, client script, admin and cron;
  - add privacy, export and deletion;
  - port and add the tests in TESTS.md.
- Staging only. Nothing goes live and no live database changes without my clear go-ahead.
- Run the full check before every commit. Log decisions in the handover, commit and push to this repo's working branch.
- Finish with a short plain-English report and the acceptance checklist from TESTS.md for me to try on my phone on staging.
```
