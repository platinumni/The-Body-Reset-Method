# Features and user journeys

Legend: **KEEP** = rebuild as is (rebranded) · **ADAPT** = rebuild but change for Platinum Life · **DROP** = Body Regen specific; leave out unless the owner asks.

## 1. Member meal planner (`/account/meal-plans`): KEEP

Source: `src/routes/account.tsx` (meal-plan routes, `mealQuery`), `src/views/meal-plans.tsx`, `src/services/meal-plans.ts`, `src/lib/meal-plans/*`.

### Journey
1. A member with access opens the planner. Without access they're redirected to the product page; admins always have access.
2. **First visit:** the form only. **Later visits, or after saving:** the form plus a plan, built from saved choices, with a fresh plan each Monday (`weekSeed()`).
3. They fill in the form (GET, so every plan is a shareable, bookmarkable URL). Fields:

| Field (`name`) | Values | Notes |
|---|---|---|
| `budget` | 10-1000 (whole units) | to the pound |
| `country` | `uk`, `us`, `ca` | currency £ / $ / C$ |
| `region` | `national` or a UK region / US region (northeast, midwest, south, west) / Canadian province | from the official price data |
| `store` | `discount` (×0.85), `mid` (×1), `premium` (×1.3) | supermarket type |
| `usual` | optional, 1-5000 | what they usually spend, for the savings line |
| `adults` | 1-12 (form offers up to 8) | |
| `size` (one per adult) | 0.8 Small, 1 Standard, 1.25 Large, 1.5 Extra large | portion multiplier |
| `kidcount` + `child` (one age box per child) | 0-10 children, ages 0-17 | under-1s excluded from portions |
| `diet` | `any`, `pescatarian`, `vegetarian`, `vegan` | |
| `exclude` | free text, comma separated, with a type-ahead list (`LEAVE_OUT_WORDS`) | word-boundary match on recipe name and ingredients |
| `allergens` | the 14 UK allergens | **never saved** |
| `snacks` | yes/no | |
| `style` | `meat`, `hearty`, `plain` (checkboxes) | steers, never excludes |
| `have` | price-item keys | "already have" ticks from the shopping list |
| `seed` | integer | shuffle |
| `picks` | recipe ids | a fixed set after a swap |
| `view` | `days` or absent | menu view (default) or day by day |

4. **The plan shows:**
   - a summary: estimated cost against the budget. If the budget is too tight: "lowest-cost week we can make … about £X. Here it is";
   - a savings line against their usual shop (per week and ×52);
   - household, store, number of recipes, and a one-off "starter cupboard" cost;
   - the meal types with no matching recipe.
5. **Actions:**
   - **Download PDF:** `window.print()` with a print stylesheet and a branded cover page;
   - **Shuffle meals:** seed+1;
   - **Remember my choices:** POST with CSRF; saves preferences but not allergies;
   - **Done your shop? What did you actually pay?:** POST; logs spend, shows a running total, tunes future estimates.
6. **This week's menu** (default): Breakfasts / Lunches / Teas / Snack cupboard, each recipe with its one-line tagline and "· N days" for batch-cooked meals. The **day by day** view shows Monday-Sunday, with "Leftovers from Monday" and "Frozen on Monday: defrost in the fridge the night before" notes.
7. **Shopping list:** "To buy" (fresh, whole packs, × packs) and "Cupboard" (pro rata cost), grouped by aisle, each with a cost and an "already have" tick. "Update the total" re-plans with the ticks.
8. **Recipe cards:**
   - photo (or a soft placeholder), meal label, name, tagline;
   - ☆ favourite toggle (POST);
   - prep/cook minutes, "makes N portions this week (×scale the amounts below)";
   - "Contains:" allergen tags, ingredients (serves N), method steps, notes;
   - "Fancy something else? Swap for:" 3 similar-cost alternatives (links that fix `picks`).
9. **Notes:**
   - the price source: how many items use official prices, the source, period and region, otherwise "estimates";
   - plans are maintain-weight (speak to a GP, registered dietitian or registered nutritionist to gain or lose);
   - allergy disclaimer ("always check labels");
   - "Leftovers, safely" (Food Standards Agency guidance);
   - babies under 1: NHS weaning guidance;
   - toddler safety (no added salt; cut up or leave out whole nuts and grapes).
10. **Optional calorie estimate per adult** (Mifflin-St Jeor, adults only). It's worked out in the browser, its inputs have no `name` so they're never submitted, and it suggests the portion size.

## 2. Favourites: KEEP
Starred recipes are preferred where the budget allows (`favourites` input; the planner adds them first on every attempt except the cheapest-possible one). Table `meal_plan_favourites`.

## 3. Savings tracker and personal price factor: KEEP
`meal_plan_spend` rows hold planned, usual and actual pence. The member sees weeks logged, the total saved against their usual shop, and how their real prices compare. **Personal factor** = the average of actual/planned over the last 4 weeks, clamped to 0.7-1.5, applied to all prices in future plans. Admin sees anonymous averages (actual spend only).

## 4. Official food prices: KEEP (UK at least)
UK uses ONS shop price quotes (Jan 2026, national plus 12 regions, 61 foods), brought up to date with the CPI food index D7C8. Canada uses Statistics Canada (48 items, provinces). The US uses BLS (needs a free `BLS_API_KEY`). A bundled JSON is refreshed about monthly by a scheduled job into `settings`. See LOGIC.md and ADMIN_AND_SERVICES.md.

## 5. Recipe photos: ADAPT
Pixabay search plus auto-pick (tag matching, raw-ingredient filter, no duplicates, reject list), and an admin hand-pick screen. Images are copied into R2 and served from the site's own domain. **Platinum Life must pick its own photos into its own bucket.** See LICENSING.md.

## 6. Admin: ADAPT to Platinum NI admin
- Recipe photos: list, auto-pick 12, choose from 12 options, remove; previews are proxied through admin for CSP.
- Stats: anonymous meal-plan savings; official price status plus "Refresh now".
- Product monthly price (Kitchen membership): DROP or map to Platinum Life membership.

## 7. Public pages and sales: DROP or ADAPT
- `/kitchen` landing page (sample £30 week, how it works, FAQs): ADAPT into a Platinum Life marketing page if wanted.
- `/kitchen/free-week` (email only, shows the meals plus the first 3 method steps, one follow-up email after 7 days, table `kitchen_trials`): optional; ADAPT only if the owner wants a free taster.
- `/kitchen/join` Stripe subscription (joining fee plus monthly), `subscriptions` table, cancel in two clicks: **DROP**. Platinum Life uses its own membership system.
- Refer-a-friend (`kitchen_friend_codes`, `kitchen_referrals`, `kitchen_friend_rewards`, Stripe coupons): **DROP** unless the owner asks.
- `/kitchen/partners` (organisations) and access codes (`access_codes`): **DROP**. Platinum NI has its own model.
- Growth-engine event reporting (`?ge=` codes), Body Regen reviews, affiliates: **DROP**.

## 8. PWA: ADAPT
Body Regen added a web manifest and icons on 28 Oct (no service worker). Platinum Life has its own PWA set-up (not verified): the planner pages just need to work inside it, offline not required. The plan URL is plain GET, so it works with any cache strategy that doesn't cache personalised HTML.
