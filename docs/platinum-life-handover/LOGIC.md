# How it works: recipes, prices, portions, planning, shopping list

All of this lives in `src/lib/meal-plans/` (pure, unit-tested). **Copy it verbatim** rather than rewriting. The notes below explain the copied behaviour so it can be checked.

## Recipes (`content/meal-plans/recipes.json`, type `Recipe` in `recipes.ts`)
153 recipes: 22 breakfasts, 30 lunches, 86 evening meals, 15 snacks. 68 vegetarian, 32 vegan, 82 pescatarian-safe.

Tiers:

| Tier | Recipes |
|---|---|
| Family favourites | 44 |
| Affordable, high-flavour staples | 37 |
| Premium everyday & global favourites | 36 |
| Classic family favourites | 15 |
| Fakeaway favourites | 14 |
| Luxury & special occasion | 7 |

```ts
type Recipe = {
  id: string;               // "002", "163" … (stable; photos and favourites key on it)
  name: string; tier: string;
  meal_type: "Breakfasts" | "Lunches" | "Evening meals" | "Snacks";
  vegetarian: boolean; pescatarian: boolean; vegan: boolean;
  serves: number; prep_minutes: number; cook_minutes: number; total_minutes: number;
  timing: string;           // "15 min total" | "15 min prep" | "standard"
  ingredients: { amount: string; name: string; cupboard: boolean }[];  // e.g. {"amount":"2 tbsp","name":"tikka paste","cupboard":true}
  method: string[]; notes: string[];
  tagline: string | null;   // one-line description, required by the build
  allergens: string[];      // keys of ALLERGEN_LABELS (14 UK allergens), auto-tagged
  image_url: null;          // unused; photos come from the photos table
  // also: diet, recipe_status "draft_for_owner_review", allergens_status, image_* (unused)
};
```

**Building:** `node scripts/build-recipes.mjs` merges three sources:
- `recipe-catalogue-2026-10-25.json` (the owner's original names, never edited);
- `recipe-catalogue-additions.json` (`recipes` added, `overrides` renames, `removed` ids, `taglines`);
- `recipes/batch-*.txt`, in line format: `R id | serves N | prep N | cook N`, `T tagline`, `I amount | name | c` (c = cupboard), `M step`, `N note`.

It auto-tags the allergens with regexes (gluten, crustaceans, eggs, fish, peanuts, soya, milk, tree nuts, celery, mustard, sesame, sulphites, lupin, molluscs), with exceptions for plant milks, butter beans, coconut and so on. It **fails** if a recipe is missing, has no ingredients, method or tagline, or has a diet label its ingredients contradict (e.g. "vegetarian" with parmesan).

## Price items (`prices.ts`, 219 items, estimates "October 2026", UK mid-range £)
```ts
type PriceItem = { key; label; aisle; re: RegExp; price: number /* per pack */; pack: number; unit: "g"|"ml"|"each"; each?: number /* grams per item */; cupboard?: boolean };
```
- Each ingredient name is matched to the **first** item whose regex fits (order matters: specific first). Every ingredient in every recipe must match; a test enforces this.
- `parseAmount()` turns amounts into grams or counts: `"2 x 150g"`, `"1 kg"`, `"500ml"`, `"3cm piece"` (×5 g), and words such as tbsp 15, tsp 5, pinch 0.5, clove 5, bunch 25, handful 30, slice 40, tin by stated grams…
- `usage(item, amount)` gives the amount in the item's pack unit, converting with `each`.
- `"leftover"` items cost 0 and never appear on the list.

## Official prices (`official.ts`, `official-sources.json`)
- `priceBook(prices, country, region)` → `{ official: {itemKey: packPrice}, estimateAdjust, source, period, note, region }`. Regional prices override national.
- **UK:**
  - 61 ONS shop-price-quote items (median of Jan 2026 quotes; national plus 12 regions; at least 8 quotes each), mapped to price keys with pack factors;
  - scaled to the latest month by CPI food index **D7C8**;
  - `estimateAdjust` scales all non-official UK estimates by the same index.
- **Canada:** Statistics Canada table 18-10-0245-01 via the WDS vectors API (48 items, provinces).
- **US:** BLS average prices, `APU<area><item>` series, national plus 4 regions (14 items). Needs `BLS_API_KEY` to avoid daily limits.
- `packPrice(item, input) = (official[item] ?? item.price × countryFactor × estimateAdjust) × storeFactor × personalFactor`
  - countryFactor: UK 1, US 1.3 (USD), CA 1.75 (CAD);
  - storeFactor: discount 0.85, mid 1, premium 1.3;
  - personalFactor: 0.7-1.5, from logged spend.

## Portions
- Adults: their portion size (0.8, 1, 1.25 or 1.5).
- Children by age: under 1 = 0 (excluded; NHS weaning note), 1-3 = 0.4, 4-6 = 0.6, 7-10 = 0.75, 11+ = 1.
- `portions = max(1, Σ adult sizes + Σ child portions)`.

## The planning algorithm (`buildPlan`)
1. **Pool:**
   - recipes that `suits()` the diet (vegan / vegetarian / pescatarian flags), the allergens (any listed allergen excludes) and the leave-outs (word-boundary regex over the name and ingredient names);
   - recipes made from leftovers are excluded;
   - snacks only if wanted;
   - each meal type is sorted by `costPerPortion` (estimate prices, `ingredient usage / pack × price`, ÷ serves).
2. **Variety levels**, tried from most to least variety. Different recipes per week:

   | Level | Breakfasts | Lunches | Evening meals | Snacks |
   |---|---|---|---|---|
   | 1 | 3 | 4 | 5 | 4 |
   | 2 | 2 | 3 | 4 | 3 |
   | 3 | 2 | 2 | 3 | 3 |
   | 4 | 1 | 2 | 2 | 2 |

3. Each level makes **12 attempts** with a seeded random generator (`seed*97 + attempt*13 + level`):
   - attempt 0 takes the cheapest;
   - later attempts widen the reach across the price range (25% + 8% per attempt);
   - favourites go in first (except on attempt 0);
   - odd-numbered attempts pick by weight `exp(recipeLean)` across all prices.
4. **`spread(n)`** shares 7 days across n recipes (the first ones get the extra days). Lunches and evening meals are **batch-cooked**: cooked on the first day, eaten as leftovers after. Food Standards Agency limits: fridge leftovers within 2 days (1 day if the recipe uses rice), so later days are marked frozen ("Frozen on Monday: defrost in the fridge the night before").
5. Each candidate week is **assembled**: slots, chosen recipes with `scale = portions × times ÷ serves`, and the shopping list and cost.
6. **Selection:**
   - keeps the cheapest week overall;
   - among weeks within budget, maximises `value = weeklyCost/budget + 1 × preferenceScore`;
   - it stops at the first variety level that produced any in-budget week.
7. **preferenceScore:**
   - for "any" or pescatarian diets: + the share of mains with meat or fish (capped at 0.6);
   - `meat` style: +1.5 × the share of mains with meat;
   - `hearty`: +0.6 × the share of carb-heavy recipes;
   - `plain`: + the plain share − the luxury share;
   - penalty of 0.5 for each main beyond 2 using the same staple (sausages, beef mince, bacon, pork mince).
8. **recipeLean** (per recipe):
   - +1 for a meat or fish main (non-veg diets);
   - meat style +2 if it has meat;
   - hearty +1.5 if carb-heavy;
   - plain: +2 for the Classic/Family/Fakeaway tiers, −2 luxury, +0.5 affordable, else −0.5.
9. **Improvement pass** (up to 3 passes, mains first): tries swapping each non-favourite pick for a better-leaning recipe from the top 15 good fits, ordered by lean then cost with seeded jitter, so Shuffle varies. It keeps the swap if the week's value improves within budget.
10. **Fixed picks** (after a swap link): uses exactly those recipes, falling back to the cheapest if over budget.
11. **Over budget:** if no week fits, it returns the cheapest week, with `overBudget = true` and `lowestPossible` set.
12. **Swaps:** for each chosen recipe, the 3 recipes of the same meal type not in the plan with the closest cost per portion.
13. `weekSeed()` changes each Monday, so members get a fresh week without doing anything.

## Shopping list (`shoppingList`)
- Sum `usage × scale` per price item across all chosen recipes.
- `packs = max(1, ceil(qty/pack − 0.05))` (a 5% tolerance so 1.03 packs counts as 1).
- **Fresh items:** cost = packs × pack price. **Cupboard items:** cost = (qty/pack) × pack price (only what this week uses).
- `have` ticks remove an item's cost. The **starter cupboard** = whole-pack cost of the cupboard items not ticked (a one-off, shown separately).
- Each line: `{key, label, aisle, packs, cost, cupboard, have, official}`, sorted by aisle then label.

## Savings and the personal factor (`services/meal-plans.ts`)
- Savings line: `usual − weeklyCost` (per week, and ×52).
- Logged weeks: `savedPence = Σ(usual − actual)` (same currency); `personalFactor` = the average of `actual/planned` over the last 4 weeks, clamped to 0.7-1.5.
- Admin: `AVG(usual − actual)` over gbp rows with `usual` set. Real amounts only, never estimates.

## Input cleaning (`readPlanInput`): copy verbatim
- Clamps every number and allow-lists every enum.
- Accepts both `kidcount`+`child` (one box per child) and the older `children` list, plus `size`/`sizes`.
- Only the 14 allergen keys are accepted.
- Leave-outs: at most 30, 40 characters each. `have`: at most 200. `picks`: at most 30.
- `snacks` and `style` respect `submitted`. `usual`: blank → null.

## Calorie estimate (client only, `reader.ts`)
- Mifflin-St Jeor: `(10w + 6.25h − 5age + (male ? 5 : −161)) × activity` (1.2 / 1.375 / 1.55 / 1.725), rounded to the nearest 50.
- Adults only.
- Suggests a portion size: under 1750 → Small, 2350 or less → Standard, 2900 or less → Large, else Extra large.
- The inputs have no `name`, so nothing is submitted or stored.

## Leave-out type-ahead
`LEAVE_OUT_WORDS` = the price-item labels without brackets, in a `<datalist>`.
