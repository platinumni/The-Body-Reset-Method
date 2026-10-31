# Platinum Life meal planner: integration handover

Written 2026-10-31 by inspecting this repository (`platinumni/The-Body-Reset-Method`, branch `claude/clever-dirac-1c0vll`).
**Source commit pinned for copying: `b8904433fde2e951218c16c4a8696c0b5b41536c`**. Copy files from that commit, not from a later one, unless the owner says otherwise.

This folder tells another Claude Code session how to rebuild the **budget meal planner** from The Body Regeneration Method (sold there as "Body Regeneration Kitchen" / "Budget Meal Plans") inside **Platinum Life**, part of the owner's Platinum NI platform. It covers the Platinum Life branding, account and membership system.

**This original project must stay unchanged.** The Platinum Life build copies code and data; it never imports from, calls, or shares a database or bucket with this project.

## Files in this folder

| File | What it covers |
|---|---|
| [FEATURES.md](FEATURES.md) | Every feature and user journey, what to keep, adapt or drop |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, hosting, bindings, file-by-file copy list, dependencies |
| [SCHEMA.md](SCHEMA.md) | Database tables used by the planner, and the proposed Platinum Life schema |
| [LOGIC.md](LOGIC.md) | Recipes, ingredients, prices, portions, the planning algorithm, shopping list, leftovers, savings, allergens, calorie estimate |
| [ADMIN_AND_SERVICES.md](ADMIN_AND_SERVICES.md) | Admin tools, scheduled jobs, third-party services, secrets (names only), running costs, AI (there is none) |
| [LICENSING.md](LICENSING.md) | Photo licences, official price data licences, recipe IP, branding |
| [SECURITY.md](SECURITY.md) | Accounts, access control, data separation, UK GDPR |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Step-by-step rebuild plan for a Cloudflare platform |
| [TESTS.md](TESTS.md) | Tests to port and acceptance criteria |
| [MASTER_PROMPT.md](MASTER_PROMPT.md) | **The one prompt to paste into the Platinum NI Claude Code chat** |

## Verified vs not verified

**Verified by reading code and running it in this repo:** everything about this project. The meal-planning code, data and tests described here exist at the pinned commit, and `npm run check` (334 tests) passed on 2026-10-30.

**Not verified (nothing here can see it):**
- The Platinum NI / Platinum Life codebase: its framework, folder layout, auth, membership model, database tables, CSP, design system, PWA set-up, admin and deploy scripts. The Platinum Life session must inspect its own repo first and map every step to what it finds.
- What another scheduled task on the owner's account suggests (data only, not checked): the Platinum NI repo is `platinumni/platinumni-website`. It uses Cloudflare D1 (binding `DB`, `--env production`), has a staging site at `platinumni-staging.michaeljmarden.workers.dev`, a live site at `platinumni.co.uk`, an `/admin` area, and records AI usage (Haiku/Opus) in an `ai_usage` table. Treat this as a lead, not a fact.
- Whether the recipe drafts, allergen tags and prices have been checked by the owner. **They have not** (status `draft_for_owner_review`, `allergens_status: auto-tagged; owner to check`).
- Recipe photos. About 45 photos had been picked on the Body Regen test site by 28 Oct, about half of them hand-checked. Photos live in Body Regen's R2 bucket and must **not** be shared. Platinum Life picks its own (see LICENSING.md).

## One-paragraph summary

A member enters a weekly food budget (to the pound), country and region, supermarket type, household (adults with portion sizes, children with ages), diet, foods to leave out, allergens to avoid and a food style. A **pure TypeScript planner** (no AI, no database) chooses a week of breakfasts, lunches, evening meals and snacks from a library of **153 recipes**, prices every ingredient against **219 price items** (official ONS/StatCan/BLS averages where available, estimates otherwise), and keeps the week within budget while favouring the member's tastes and variety. It handles batch cooking with food-safe leftovers and freezing, builds a shopping list (fresh food in whole packs, cupboard items pro rata, "already have" ticks), and offers swaps, shuffle, favourites, saved preferences, a printable PDF via the browser, and a savings tracker that learns from what members actually paid. All server-rendered HTML with one small no-dependency client script; strict CSP; Cloudflare Workers + D1 + R2.
