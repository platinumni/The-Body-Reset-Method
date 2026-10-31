# Tests and acceptance criteria

## Tests to port (they exist and pass at the pinned commit)
`test/meal-plans-lib.test.ts` (pure planner):
- every ingredient in every recipe has an estimated price (price-item match);
- reads amounts (`parseAmount`);
- gives every recipe a sensible cost per portion;
- fits the budget for one adult at £40;
- says when the budget is too low and gives the lowest possible;
- respects diet, leave-outs and allergens;
- sizes portions by household and leaves babies out;
- a bigger budget brings more variety;
- ticking cupboard items you already have lowers the cost;
- keeps a chosen set of recipes when swapping;
- reports realistic costs;
- never plans fridge leftovers beyond 2 days (1 for rice): later portions are frozen;
- raises the estimate when someone's real shop costs more;
- a family who eats everything gets meat or fish in most evening meals, even on a tight budget;
- vegetarians still get no meat;
- "Plain and simple" leans to classic family meals;
- reads one age per child and a portion size per adult, ignoring hidden extra boxes;
- bigger portions make a bigger (dearer) shop;
- gives a different week each time (5 shuffles → at least 4 different weeks);
- never suggests recipes too simple to need one.

`test/official-prices.test.ts`:
- every mapped ingredient exists in the price list;
- the bundled copy has current UK and Canadian prices;
- uses official prices in the plan, and regional ones over national;
- brings UK prices up to date with the food index;
- matches Canadian results by vector, whatever order they come back in;
- refreshes into settings, keeping a country's previous prices if it fails.

`test/meal-plans.test.tsx` (pages; adapt URLs, auth and branding):
- is only for members who own it (→ Platinum Life members only);
- shows the form first, then a plan within budget with recipes, shopping list and notes;
- explains when the budget is too low;
- remembers choices when asked;
- shows what you could save against your usual shop;
- records what you actually paid, keeps a running total and never saves allergies;
- offers an optional calorie estimate, worked out on the device.

`test/recipe-photos.test.tsx`:
- short search first, and only a photo whose tags match the dish (no raw ingredients, no duplicates, rejected ids never picked);
- auto-pick copies into storage, records the licence and serves it;
- admin can choose or remove;
- never fetches from anywhere but Pixabay;
- admin only;
- stops quietly on Pixabay's limit and keeps what it picked.

`scripts/build-recipes.test.mjs`: the recipe build checks (diet labels, allergens, completeness).

## Extra tests Platinum Life needs
- **Access:** a logged-out user → login; a logged-in non-member → upgrade page; a Platinum Life member → planner; an admin → planner.
- **Separation:** a static check that no source file references `bodyregen`, `Body Regeneration`, `BRM` or `bodyregenerationmethod.com` (grep in a test). No binding or URL points to Body Regen resources.
- **Data rights:** export includes `pl_meal_*` rows; deletion removes them.
- **CSRF:** each POST without a token is rejected.
- **PWA:** the planner HTML response isn't cached by the service worker (assert the headers or SW route config); the manifest is still valid.
- **Branding:** the print cover shows "Platinum Life"; no Body Regen strings in the rendered HTML.

## Acceptance criteria (owner checks on staging, on a phone)
1. From the Platinum Life dashboard, a member taps "Meal planner" and sees the form. **No second login.**
2. With £40, 1 adult, UK, mid-range: a full week appears in under 2 seconds, estimated within budget, with menu, shopping list, recipes and notes.
3. A family of 2 adults + 2 children (ages 4 and 9) on £70 gets meat or fish in most evening meals; "More meat", "Hearty" and "Plain and simple" visibly change the week.
4. Vegetarian, vegan, leave-outs ("mushrooms") and allergens (e.g. Milk) are respected in every recipe shown.
5. A too-low budget (£15 for 4) shows the "lowest-cost week we can make" message.
6. Shuffle gives a different week; a swap link replaces just that recipe; favourites stick when the budget allows.
7. Shopping list ticks lower the total; the cupboard is costed pro rata; there's a starter cupboard line.
8. Day-by-day view shows leftovers and "Frozen on…" notes correctly (no fridge leftovers over 2 days, 1 for rice).
9. "Remember my choices" restores everything next visit **except allergies**; the next Monday gives a fresh week.
10. Logging what was paid shows the running total; after a few weeks, estimates move towards real prices.
11. Download PDF prints a clean, Platinum Life branded plan (cover, menu, list, recipes) from iPhone and Android, including from the home-screen app.
12. Every recipe card has a correct photo (checked by a person) or a tidy placeholder.
13. The price note shows the official source and month; UK regions change prices.
14. Nothing anywhere says Body Regeneration, Kitchen or AI; the price wording never says "live".
15. Body Regen is untouched: no commits to `platinumni/The-Body-Reset-Method`, and its staging and production are unaffected.
