#!/usr/bin/env node
// Combine the owner's recipe catalogue with the full recipe drafts in
// content/meal-plans/recipes/*.txt, tag the 14 UK allergens from the ingredient
// names, check the diet labels, and write content/meal-plans/recipes.json.
//
//   node scripts/build-recipes.mjs          (writes the file, exits 1 if any check fails)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "content", "meal-plans");

export function parseRecipes(text) {
  const out = [];
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [tag, ...rest] = line.split(" ");
    const body = rest.join(" ");
    if (tag === "R") {
      const [id, serves, prep, cook] = body.split("|").map((s) => s.trim());
      cur = { id, serves: Number(serves.replace("serves", "")), prep_minutes: Number(prep.replace("prep", "")), cook_minutes: Number(cook.replace("cook", "")), ingredients: [], method: [], notes: [] };
      out.push(cur);
    } else if (!cur) throw new Error(`Line before first recipe: ${line}`);
    else if (tag === "I") {
      const [amount, name, flag] = body.split("|").map((s) => s.trim());
      cur.ingredients.push({ amount, name, cupboard: flag === "c" });
    } else if (tag === "M") cur.method.push(body);
    else if (tag === "N") cur.notes.push(body);
    else throw new Error(`Unknown line in recipe ${cur.id}: ${line}`);
  }
  return out;
}

// The 14 allergens UK law requires businesses to declare. Matched on ingredient names.
// It's a first pass for the owner to check, not a guarantee.
export const ALLERGENS = {
  "cereals containing gluten": /\b(flour|bread|brioche|sourdough|baguette|ciabatta|pitta|pita|tortilla|wrap|flatbread|rye|pasta|spaghetti|linguine|orzo|ditalini|couscous|noodles|udon|soba|gnocchi|panko|breadcrumbs|puff pastry|oats|granola|soy sauce|gochujang|chilli bean paste|doubanjiang|rolls?|buns?|soldiers)\b/i,
  crustaceans: /\b(prawns?|crab|lobster|shrimp)\b/i,
  eggs: /\b(eggs?|mayonnaise|mayo|brioche|egg noodles)\b/i,
  fish: /\b(cod|salmon|sea bass|sardines?|mackerel|tuna|fish sauce|fish fillets|anchov\w*|white fish|pollock)\b/i,
  peanuts: /\bpeanuts?\b/i,
  soybeans: /\b(tofu|soy sauce|edamame|miso|gochujang|soya|chilli bean paste|doubanjiang)\b/i,
  milk: /\b(milk|butter|cream|crème fraîche|cheese|cheddar|parmesan|feta|ricotta|burrata|mozzarella|paneer|halloumi|yoghurt|ghee|chocolate)\b/i,
  nuts: /\b(almonds?|pistachios?|walnuts?|hazelnuts?|cashews?|pecans?|mixed nuts|unsalted nuts|almond butter|pesto)\b/i,
  celery: /\b(celery|celeriac|stock)\b/i,
  mustard: /\bmustard\b/i,
  sesame: /\b(sesame|tahini|hummus)\b/i,
  sulphites: /\b(wine|dried apricots|raisins|balsamic|vinegar|cornichons|pickles?|gherkins?)\b/i,
  lupin: /\blupin\b/i,
  molluscs: /\b(mussels?|squid|scallops?|clams?|oysters?)\b/i,
};

// Plant versions that don't carry the allergen, and other exceptions.
const NOT_MILK = /\b(butter beans?|oat milk|plant milk|plant-based|coconut milk|coconut drinking milk|dairy-free|peanut butter|almond butter|vegan)\b/i;
const NOT_EGG = /\b(vegan mayonnaise|eggs? or)\b/i;

export function allergensFor(ingredients) {
  const found = new Set();
  for (const { name } of ingredients) {
    for (const [allergen, re] of Object.entries(ALLERGENS)) {
      if (!re.test(name)) continue;
      if (allergen === "milk" && NOT_MILK.test(name)) continue;
      if (allergen === "eggs" && NOT_EGG.test(name)) continue;
      if (allergen === "nuts" && /\bcoconut\b/i.test(name)) continue;
      found.add(allergen);
    }
  }
  return [...found].sort();
}

const MEAT = /\b(chicken|beef|steak|lamb|pork|sausages?|duck|pancetta|prosciutto|bacon|ham|chorizo|short ribs|turkey)\b/i;
const FISH_OR_SEAFOOD = /\b(cod|salmon|sea bass|sardines?|mackerel|tuna|fish|prawns?|crab|lobster|scallops?|mussels?|squid|anchov\w*|pollock)\b/i;
const ANIMAL = /\b(milk|butter|cream|crème fraîche|cheese|cheddar|parmesan|feta|ricotta|burrata|mozzarella|paneer|halloumi|yoghurt|eggs?|honey|mayonnaise|ghee|gelatine)\b/i;
const PLANT_OK = /\b(butter beans?|oat milk|plant milk|plant-based|coconut|dairy-free|peanut butter|almond butter|vegan|vegetable stock)\b/i;
const STOCK_NOT_VEG = /\b(chicken|beef|lamb|fish) (or \w+ )?stock\b/i;

export function dietProblems(recipe, meta) {
  const problems = [];
  for (const { name } of recipe.ingredients) {
    if (meta.vegetarian && MEAT.test(name)) problems.push(`vegetarian but has "${name}"`);
    if (meta.vegetarian && FISH_OR_SEAFOOD.test(name) && !/vegetable/i.test(name)) problems.push(`vegetarian but has "${name}"`);
    if (meta.pescatarian && MEAT.test(name)) problems.push(`pescatarian but has "${name}"`);
    if (meta.vegetarian && STOCK_NOT_VEG.test(name)) problems.push(`vegetarian but has "${name}"`);
    if (meta.vegetarian && /\bparmesan\b/i.test(name) && !/vegetarian/i.test(name)) problems.push(`vegetarian but has "${name}" (animal rennet)`);
    if (meta.vegan && ANIMAL.test(name) && !PLANT_OK.test(name)) problems.push(`vegan but has "${name}"`);
  }
  return problems;
}

const timingLabel = (r) => (r.prep_minutes + r.cook_minutes <= 15 ? "15 min total" : r.prep_minutes <= 15 ? "15 min prep" : "standard");

export function build() {
  const catalogue = JSON.parse(readFileSync(join(DIR, "recipe-catalogue-2026-10-25.json"), "utf8"));
  const files = readdirSync(join(DIR, "recipes")).filter((f) => f.endsWith(".txt")).sort();
  const drafts = new Map(files.flatMap((f) => parseRecipes(readFileSync(join(DIR, "recipes", f), "utf8"))).map((r) => [r.id, r]));
  const problems = [];
  const recipes = catalogue.recipes.map((meta) => {
    const r = drafts.get(meta.id);
    if (!r) {
      problems.push(`${meta.id} ${meta.name}: no recipe written`);
      return { ...meta };
    }
    if (!r.ingredients.length || !r.method.length) problems.push(`${meta.id}: missing ingredients or method`);
    for (const p of dietProblems(r, meta)) problems.push(`${meta.id} ${meta.name}: ${p}`);
    return {
      ...meta,
      serves: r.serves,
      prep_minutes: r.prep_minutes,
      cook_minutes: r.cook_minutes,
      total_minutes: r.prep_minutes + r.cook_minutes,
      timing: timingLabel(r),
      ingredients: r.ingredients,
      method: r.method,
      notes: r.notes,
      allergens: allergensFor(r.ingredients),
      allergens_status: "auto-tagged; owner to check",
      recipe_status: "draft_for_owner_review",
    };
  });
  for (const id of drafts.keys()) if (!catalogue.recipes.some((m) => m.id === id)) problems.push(`${id}: recipe written but not in the catalogue`);
  return { recipes, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { recipes, problems } = build();
  writeFileSync(join(DIR, "recipes.json"), JSON.stringify({ generated_from: "recipe-catalogue-2026-10-25.json + recipes/*.txt", recipes }, null, 2) + "\n");
  console.log(`${recipes.length} recipes written to content/meal-plans/recipes.json`);
  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("✓ All recipes complete and diet labels consistent.");
}
