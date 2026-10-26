// Builds a week of meals that fits a budget, from the recipe library. Pure: no database.
// Prices are estimates (see prices.ts) adjusted for country and supermarket type.

import { PRICE_ITEMS, priceItemFor, usage, type Aisle, type PriceItem } from "./prices";
import type { PriceBook } from "./official";
import { RECIPES, type MealType, type Recipe } from "./recipes";

export type Country = "uk" | "us" | "ca";
export type Store = "discount" | "mid" | "premium";
export type Diet = "any" | "pescatarian" | "vegetarian" | "vegan";

export const COUNTRIES: Record<Country, { label: string; currency: string; symbol: string; factor: number; source: string }> = {
  uk: { label: "United Kingdom", currency: "GBP", symbol: "£", factor: 1, source: "Office for National Statistics average prices (to be connected); currently estimated" },
  us: { label: "United States", currency: "USD", symbol: "$", factor: 1.3, source: "Bureau of Labor Statistics average prices (to be connected); currently estimated" },
  ca: { label: "Canada", currency: "CAD", symbol: "C$", factor: 1.75, source: "Statistics Canada average prices (to be connected); currently estimated" },
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

export function householdPortions(adults: number, childAges: number[]): number {
  return Math.max(1, adults + childAges.reduce((t, a) => t + portionFor(a), 0));
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

// Small seeded random, so the same choices give the same plan, and "shuffle" gives a new one.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** How many different recipes of each kind, from most to least variety. */
const VARIETY: Record<MealType, number>[] = [
  { Breakfasts: 3, Lunches: 4, "Evening meals": 5, Snacks: 3 },
  { Breakfasts: 2, Lunches: 3, "Evening meals": 4, Snacks: 2 },
  { Breakfasts: 2, Lunches: 2, "Evening meals": 3, Snacks: 2 },
  { Breakfasts: 1, Lunches: 2, "Evening meals": 2, Snacks: 1 },
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
  const portions = householdPortions(input.adults, input.childAges);
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

  const consider = (picks: Record<MealType, Recipe[]>) => {
    const a = { ...assemble(picks, input, portions), picks };
    if (!cheapest || a.weeklyCost < cheapest.weeklyCost) cheapest = a;
    if (a.weeklyCost <= input.budget && (!best || a.weeklyCost > best.weeklyCost)) best = a;
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
          while (take.size < Math.min(level[meal], candidates.length)) take.add(attempt === 0 ? candidates[take.size]! : candidates[Math.floor(rand() * candidates.length)]!);
          picks[meal] = [...take];
        }
        consider(picks);
      }
      if (best) break;
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
