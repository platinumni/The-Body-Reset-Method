// Builds a week of meals that fits a budget, from the recipe library. Pure: no database.
// Prices are estimates (see prices.ts) adjusted for country and supermarket type.

import { PRICE_ITEMS, priceItemFor, usage, type Aisle, type PriceItem } from "./prices";
import type { PriceBook } from "./official";
import { RECIPES, type MealType, type Recipe } from "./recipes";

export type Country = "uk" | "us" | "ca";
export type Store = "discount" | "mid" | "premium";
export type Diet = "any" | "pescatarian" | "vegetarian" | "vegan";
export type FoodStyle = "meat" | "hearty" | "plain";
export const FOOD_STYLES: Record<FoodStyle, string> = { meat: "More meat", hearty: "Hearty (more pasta, potatoes, rice and bread)", plain: "Plain and simple" };

export const COUNTRIES: Record<Country, { label: string; currency: string; symbol: string; factor: number; source: string }> = {
  uk: { label: "United Kingdom", currency: "GBP", symbol: "£", factor: 1, source: "Office for National Statistics shop prices" },
  us: { label: "United States", currency: "USD", symbol: "$", factor: 1.3, source: "Bureau of Labor Statistics average prices" },
  ca: { label: "Canada", currency: "CAD", symbol: "C$", factor: 1.75, source: "Statistics Canada average prices" },
};
export const STORES: Record<Store, { label: string; factor: number }> = {
  discount: { label: "Discount (e.g. Aldi, Lidl)", factor: 0.85 },
  mid: { label: "Mid-range (e.g. Tesco, Asda, Sainsbury's)", factor: 1 },
  premium: { label: "Premium (e.g. Waitrose, M&S)", factor: 1.3 },
};

export type PlanInput = {
  budget: number;
  country: Country;
  store: Store;
  adults: number;
  childAges: number[];
  diet: Diet;
  exclude: string[];
  avoidAllergens: string[];
  snacks: boolean;
  seed: number;
  have: string[];
  picks?: string[];
  /** Recipes the member has starred: included where the budget allows. */
  favourites?: string[];
  /** Each adult's portion size (1 = standard), in order. Missing = standard. */
  adultSizes?: number[];
  /** Food style: lean towards more meat, more filling carbs, or plain familiar food. Guides the plan; nothing is ruled out. */
  styles?: FoodStyle[];
  /** What they usually spend on food a week (optional), for the savings line. */
  usual?: number | null;
  /** How their real shop compares with our estimates (from what they actually paid). 1 = as estimated. */
  personalFactor?: number;
  /** US region or Canadian province ("national" if not chosen). */
  region?: string;
  /** Official average prices for the chosen country and region, where we have them. */
  book?: PriceBook;
};

export type ShoppingLine = { key: string; label: string; aisle: Aisle; packs: number; cost: number; cupboard: boolean; have: boolean; official: boolean };
export type Slot = { day: number; meal: MealType; recipe: Recipe; cook: boolean; note: string | null; freeze: boolean };
export type Plan = {
  input: PlanInput;
  portions: number;
  babies: number;
  recipes: { recipe: Recipe; times: number; scale: number }[];
  slots: Slot[];
  shopping: ShoppingLine[];
  weeklyCost: number;
  starterCupboard: number;
  overBudget: boolean;
  lowestPossible: number | null;
  noRecipes: MealType[];
  swaps: Record<string, Recipe[]>;
};

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ORDER: MealType[] = ["Breakfasts", "Lunches", "Evening meals", "Snacks"];

/** Portion of an adult serving by age. Under-1s aren't catered for (they need milk and weaning foods). */
export function portionFor(age: number): number {
  if (age < 1) return 0;
  if (age <= 3) return 0.4;
  if (age <= 6) return 0.6;
  if (age <= 10) return 0.75;
  return 1;
}

/** Adult portion sizes people can choose (1 = a standard adult portion). */
export const PORTION_SIZES: { value: number; label: string }[] = [
  { value: 0.8, label: "Small" },
  { value: 1, label: "Standard" },
  { value: 1.25, label: "Large" },
  { value: 1.5, label: "Extra large" },
];

export function householdPortions(adults: number, childAges: number[], adultSizes: number[] = []): number {
  const grown = Array.from({ length: adults }, (_, i) => adultSizes[i] ?? 1).reduce((t, n) => t + n, 0);
  return Math.max(1, grown + childAges.reduce((t, a) => t + portionFor(a), 0));
}

type PriceInput = Pick<PlanInput, "country" | "store" | "personalFactor" | "book">;

/** Price of one pack: the official average where we have one, otherwise our estimate (kept current with the official food price index). */
export function packPrice(item: PriceItem, input: PriceInput): number {
  const official = input.book?.official[item.key];
  const base = official ?? item.price * COUNTRIES[input.country].factor * (input.book?.estimateAdjust ?? 1);
  return base * STORES[input.store].factor * (input.personalFactor ?? 1);
}

/** Does this recipe suit the person's diet, leave-outs and allergens? */
export function suits(r: Recipe, input: Pick<PlanInput, "diet" | "exclude" | "avoidAllergens">): boolean {
  if (input.diet === "vegan" && !r.vegan) return false;
  if (input.diet === "vegetarian" && !r.vegetarian) return false;
  if (input.diet === "pescatarian" && !r.pescatarian) return false;
  if (input.avoidAllergens.some((a) => r.allergens.includes(a))) return false;
  const text = [r.name, ...r.ingredients.map((i) => i.name)].join(" ").toLowerCase();
  return !input.exclude.some((word) => word && new RegExp(`\\b${escapeRe(word.toLowerCase())}`).test(text));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rough cost of one portion, used to choose cheaper or more generous recipes. */
export function costPerPortion(r: Recipe, factor = 1): number {
  let total = 0;
  for (const ing of r.ingredients) {
    const item = priceItemFor(ing.name);
    if (!item) continue;
    total += (usage(item, ing.amount) / item.pack) * item.price;
  }
  return (total * factor) / Math.max(1, r.serves);
}

/** The shopping list for a set of recipes, each cooked `scale` times its written amounts. */
export function shoppingList(chosen: { recipe: Recipe; scale: number }[], input: PriceInput & Pick<PlanInput, "have">) {
  const totals = new Map<string, { item: PriceItem; qty: number }>();
  for (const { recipe, scale } of chosen) {
    for (const ing of recipe.ingredients) {
      const item = priceItemFor(ing.name);
      if (!item || item.key === "leftover") continue;
      const t = totals.get(item.key) ?? { item, qty: 0 };
      t.qty += usage(item, ing.amount) * scale;
      totals.set(item.key, t);
    }
  }
  const lines: ShoppingLine[] = [];
  let weeklyCost = 0;
  let starterCupboard = 0;
  for (const { item, qty } of totals.values()) {
    const have = input.have.includes(item.key);
    const packs = Math.max(1, Math.ceil(qty / item.pack - 0.05));
    // Fresh food: you buy whole packs. Cupboard items: only what this week uses counts.
    const price = packPrice(item, input);
    const cost = item.cupboard ? (qty / item.pack) * price : packs * price;
    if (!have) weeklyCost += cost;
    if (item.cupboard && !have) starterCupboard += packs * price;
    lines.push({ key: item.key, label: item.label, aisle: item.aisle, packs, cost, cupboard: !!item.cupboard, have, official: input.book?.official[item.key] != null });
  }
  lines.sort((a, b) => a.aisle.localeCompare(b.aisle) || a.label.localeCompare(b.label));
  return { lines, weeklyCost, starterCupboard };
}

// --- Food style -------------------------------------------------------------

const hasMeat = (r: Recipe) => !r.pescatarian;
const hasMeatOrFish = (r: Recipe) => !r.vegetarian;
const CARBS = /\b(pasta|spaghetti|potato(es)?|rice|bread|noodles|wraps?|tortilla|rolls?|gnocchi|couscous|chips)\b/i;
const carbHeavy = (r: Recipe) => r.ingredients.some((i) => CARBS.test(i.name) && !/cakes|vinegar|noodles? \(optional\)/i.test(i.name));
const PLAIN_TIERS = ["Classic family favourites", "Family favourites", "Fakeaway favourites"];
const isPlain = (r: Recipe) => PLAIN_TIERS.includes(r.tier);
const isLuxury = (r: Recipe) => r.tier.startsWith("Luxury");

/** How well a recipe fits what the person asked for (0 = neutral). Used to steer which recipes are tried. */
function recipeLean(r: Recipe, input: Pick<PlanInput, "diet" | "styles">): number {
  const styles = input.styles ?? [];
  const main = r.meal_type === "Evening meals" || r.meal_type === "Lunches";
  let w = 0;
  // Most people who eat everything expect meat or fish in most main meals.
  if (main && input.diet !== "vegetarian" && input.diet !== "vegan" && hasMeatOrFish(r)) w += 1;
  if (styles.includes("meat") && hasMeat(r)) w += 2;
  if (styles.includes("hearty") && carbHeavy(r)) w += 1.5;
  if (styles.includes("plain")) w += isPlain(r) ? 2 : isLuxury(r) ? -2 : r.tier.startsWith("Affordable") ? 0.5 : -0.5;
  return w;
}

const STAPLES = [/sausages/i, /beef mince|minced beef/i, /bacon/i, /pork mince/i];

/** How well a whole week fits. The planner takes the week that uses the budget well AND fits best. */
export function preferenceScore(picks: Recipe[], input: Pick<PlanInput, "diet" | "styles">): number {
  const styles = input.styles ?? [];
  const mains = picks.filter((r) => r.meal_type === "Evening meals" || r.meal_type === "Lunches");
  const share = (list: Recipe[], f: (r: Recipe) => boolean) => (list.length ? list.filter(f).length / list.length : 0);
  let score = 0;
  if (input.diet !== "vegetarian" && input.diet !== "vegan") score += Math.min(share(mains, hasMeatOrFish), 0.6);
  if (styles.includes("meat")) score += 1.5 * share(mains, hasMeat);
  if (styles.includes("hearty")) score += 0.6 * share(picks, carbHeavy);
  if (styles.includes("plain")) score += share(picks, isPlain) - share(picks, isLuxury);
  // Variety: no more than two main meals built on the same cheap staple (e.g. sausages three nights running).
  for (const re of STAPLES) {
    const n = mains.filter((r) => r.ingredients.some((i) => re.test(i.name))).length;
    if (n > 2) score -= 0.5 * (n - 2);
  }
  return score;
}

/** Fit matters, but never more than a sensible use of the budget: 0.35 of score ≈ 35% of the budget. */
const PREFERENCE_WEIGHT = 0.35;

// Small seeded random, so the same choices give the same plan, and "shuffle" gives a new one.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** How many different recipes of each kind, from most to least variety. */
const VARIETY: Record<MealType, number>[] = [
  { Breakfasts: 3, Lunches: 4, "Evening meals": 5, Snacks: 4 },
  { Breakfasts: 2, Lunches: 3, "Evening meals": 4, Snacks: 3 },
  { Breakfasts: 2, Lunches: 2, "Evening meals": 3, Snacks: 3 },
  { Breakfasts: 1, Lunches: 2, "Evening meals": 2, Snacks: 2 },
];

/** Spread n recipes over 7 days: the first ones cover more days. Evening meals are cooked once and eaten on following days. */
function spread(n: number): number[] {
  const base = Math.floor(7 / n);
  const extra = 7 % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

const usesRice = (r: Recipe) => r.ingredients.some((i) => /\brice\b(?! (noodles|cakes|vinegar))/i.test(i.name));

function assemble(picks: Record<MealType, Recipe[]>, input: PlanInput, portions: number) {
  const slots: Slot[] = [];
  const chosen: { recipe: Recipe; times: number; scale: number }[] = [];
  for (const meal of ORDER) {
    const list = picks[meal];
    if (!list.length) continue;
    const counts = spread(list.length);
    let day = 0;
    list.forEach((recipe, i) => {
      const times = counts[i]!;
      chosen.push({ recipe, times, scale: (portions * times) / recipe.serves });
      const batch = meal === "Evening meals" || meal === "Lunches";
      // Food Standards Agency guidance: eat fridge leftovers within 2 days, and cooked rice within 1.
      // Anything later is frozen on the day it's cooked.
      const fridgeDays = usesRice(recipe) ? 1 : 2;
      for (let k = 0; k < times; k++, day++) {
        const freeze = batch && k > fridgeDays;
        const note = !batch || k === 0 ? null : freeze ? `Frozen on ${DAYS[day - k]}: defrost in the fridge the night before` : `Leftovers from ${DAYS[day - k]}`;
        slots.push({ day, meal, recipe, cook: !batch || k === 0, note, freeze });
      }
    });
  }
  const { lines, weeklyCost, starterCupboard } = shoppingList(chosen, input);
  return { slots, chosen, lines, weeklyCost, starterCupboard };
}

export function buildPlan(input: PlanInput): Plan {
  const portions = householdPortions(input.adults, input.childAges, input.adultSizes);
  const babies = input.childAges.filter((a) => a < 1).length;
  const pool: Record<MealType, Recipe[]> = { Breakfasts: [], Lunches: [], "Evening meals": [], Snacks: [] };
  // Recipes made from another recipe's leftovers aren't planned on their own.
  const standalone = (r: Recipe) => !r.ingredients.some((i) => /leftover/i.test(i.name));
  for (const r of RECIPES) if (suits(r, input) && standalone(r) && (input.snacks || r.meal_type !== "Snacks")) pool[r.meal_type].push(r);
  for (const meal of ORDER) pool[meal].sort((a, b) => costPerPortion(a) - costPerPortion(b));
  const noRecipes = ORDER.filter((m) => (m !== "Snacks" || input.snacks) && pool[m].length === 0);

  const fixed = input.picks?.map((id) => RECIPES.find((r) => r.id === id)).filter((r): r is Recipe => !!r && suits(r, input));
  type Candidate = ReturnType<typeof assemble> & { picks: Record<MealType, Recipe[]> };
  let best = null as Candidate | null;
  let cheapest = null as Candidate | null;

  const value = (c: Candidate) => c.weeklyCost / Math.max(1, input.budget) + PREFERENCE_WEIGHT * preferenceScore(ORDER.flatMap((m) => c.picks[m]), input);
  const consider = (picks: Record<MealType, Recipe[]>) => {
    const a = { ...assemble(picks, input, portions), picks };
    if (!cheapest || a.weeklyCost < cheapest.weeklyCost) cheapest = a;
    if (a.weeklyCost <= input.budget && (!best || value(a) > value(best))) best = a;
  };
  const leaning = ORDER.some((m) => pool[m].some((r) => recipeLean(r, input) !== 0));
  /** Pick one, favouring recipes that fit what they asked for. */
  const weighted = (list: Recipe[], rand: () => number, taken: Set<Recipe>) => {
    const open = list.filter((r) => !taken.has(r));
    const weights = open.map((r) => Math.exp(recipeLean(r, input)));
    let x = rand() * weights.reduce((t, w) => t + w, 0);
    for (let i = 0; i < open.length; i++) if ((x -= weights[i]!) <= 0) return open[i]!;
    return open[open.length - 1]!;
  };

  if (fixed && fixed.length) {
    const picks: Record<MealType, Recipe[]> = { Breakfasts: [], Lunches: [], "Evening meals": [], Snacks: [] };
    for (const r of fixed) if (input.snacks || r.meal_type !== "Snacks") picks[r.meal_type].push(r);
    consider(picks);
    best = best ?? cheapest;
  } else {
    // Try each variety level with a few random draws, leaning cheaper as the budget gets tighter.
    for (const level of VARIETY) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const rand = rng(input.seed * 97 + attempt * 13 + VARIETY.indexOf(level));
        const picks: Record<MealType, Recipe[]> = { Breakfasts: [], Lunches: [], "Evening meals": [], Snacks: [] };
        for (const meal of ORDER) {
          const options = pool[meal];
          if (!options.length || (meal === "Snacks" && !input.snacks)) continue;
          // attempt 0 takes the cheapest; later attempts sample more widely across the price range.
          const reach = Math.min(options.length, Math.max(level[meal], Math.ceil(options.length * Math.min(1, 0.25 + attempt * 0.08))));
          const candidates = options.slice(0, reach);
          const take = new Set<Recipe>();
          // Favourites first (after the cheapest-possible attempt), if they fit the variety for this meal.
          if (attempt > 0) for (const r of options) if (input.favourites?.includes(r.id) && take.size < level[meal]) take.add(r);
          // Every other attempt leans towards what they asked for (more meat, hearty, plain), across all prices.
          const lean = leaning && attempt % 2 === 1;
          const from = lean ? options : candidates;
          while (take.size < Math.min(level[meal], from.length)) take.add(attempt === 0 ? from[take.size]! : lean ? weighted(from, rand, take) : from[Math.floor(rand() * from.length)]!);
          picks[meal] = [...take];
        }
        consider(picks);
      }
      if (best) break;
    }
  }

  // Then improve the chosen week one meal at a time: swap in recipes that fit what they asked for
  // (e.g. meat in most main meals) wherever the budget allows. Picked or starred meals are left alone.
  if (best && !(fixed && fixed.length)) {
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      // Main meals first, so the budget goes where it matters most.
      for (const meal of ["Evening meals", "Lunches", "Breakfasts", "Snacks"] as MealType[]) {
        const preferred = pool[meal].filter((r) => recipeLean(r, input) > 0).sort((a, b) => recipeLean(b, input) - recipeLean(a, input) || costPerPortion(a) - costPerPortion(b)).slice(0, 15);
        for (let i = 0; i < best.picks[meal].length; i++) {
          const current = best.picks[meal][i]!;
          if (input.favourites?.includes(current.id)) continue;
          for (const r of preferred) {
            if (best.picks[meal].includes(r) || recipeLean(r, input) <= recipeLean(current, input)) continue;
            const picks = { ...best.picks, [meal]: best.picks[meal].map((x, j) => (j === i ? r : x)) };
            const before: Candidate | null = best;
            consider(picks);
            if (best !== before) {
              improved = true;
              break;
            }
          }
        }
      }
      if (!improved) break;
    }
  }

  const result: Candidate = best ?? cheapest!;
  const inPlan = new Set(result.chosen.map((c) => c.recipe.id));
  const swaps: Record<string, Recipe[]> = {};
  for (const { recipe } of result.chosen) {
    const target = costPerPortion(recipe);
    swaps[recipe.id] = pool[recipe.meal_type]
      .filter((r) => !inPlan.has(r.id))
      .sort((a, b) => Math.abs(costPerPortion(a) - target) - Math.abs(costPerPortion(b) - target))
      .slice(0, 3);
  }
  const over = result.weeklyCost > input.budget;
  return {
    input,
    portions,
    babies,
    recipes: result.chosen,
    slots: result.slots,
    shopping: result.lines,
    weeklyCost: result.weeklyCost,
    starterCupboard: result.starterCupboard,
    overBudget: over,
    lowestPossible: over && cheapest ? cheapest.weeklyCost : null,
    noRecipes,
    swaps,
  };
}

/** Every ingredient word people can leave out, for the type-to-search list. */
export const LEAVE_OUT_WORDS = [...new Set(PRICE_ITEMS.filter((p) => p.key !== "leftover").map((p) => p.label.replace(/\s*\(.*\)/, "")))].sort();

/** A seed that changes each week, so members get a fresh plan every Monday without doing anything. */
export function weekSeed(d = new Date()): number {
  const day = Math.floor(d.getTime() / 86_400_000) + 3; // days since a Monday (1 Jan 1970 was a Thursday)
  return Math.floor(day / 7) % 1_000_000 || 1;
}

export function money(amount: number, country: Country) {
  return `${COUNTRIES[country].symbol}${amount.toFixed(2)}`;
}
