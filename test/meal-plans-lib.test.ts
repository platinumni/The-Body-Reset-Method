import { describe, expect, it } from "vitest";
import { buildPlan, costPerPortion, householdPortions, suits, type PlanInput } from "../src/lib/meal-plans/planner";
import { parseAmount, priceItemFor } from "../src/lib/meal-plans/prices";
import { RECIPES } from "../src/lib/meal-plans/recipes";

const base: PlanInput = { budget: 40, country: "uk", store: "mid", adults: 1, childAges: [], diet: "any", exclude: [], avoidAllergens: [], snacks: true, seed: 1, have: [] };

describe("meal plan prices", () => {
  it("every ingredient in every recipe has an estimated price", () => {
    const missing = RECIPES.flatMap((r) => r.ingredients.filter((i) => !priceItemFor(i.name)).map((i) => `${r.id}: ${i.name}`));
    expect(missing).toEqual([]);
  });

  it("reads amounts", () => {
    expect(parseAmount("2 x 150g")).toEqual({ qty: 300, unit: "g" });
    expect(parseAmount("1.2 litres")).toEqual({ qty: 1200, unit: "g" });
    expect(parseAmount("2 tbsp")).toEqual({ qty: 30, unit: "g" });
    expect(parseAmount("1/2")).toEqual({ qty: 0.5, unit: "count" });
    expect(parseAmount("3cm piece")).toEqual({ qty: 15, unit: "g" });
  });

  it("gives every recipe a sensible cost per portion", () => {
    for (const r of RECIPES) {
      const c = costPerPortion(r);
      expect(c, `${r.id} ${r.name}`).toBeGreaterThan(0.05);
      expect(c, `${r.id} ${r.name}`).toBeLessThan(15);
    }
  });
});

describe("meal plan builder", () => {
  it("fits the budget for one adult at £40", () => {
    const plan = buildPlan(base);
    expect(plan.overBudget).toBe(false);
    expect(plan.weeklyCost).toBeLessThanOrEqual(40);
    expect(plan.slots.filter((s) => s.meal === "Evening meals")).toHaveLength(7);
    expect(plan.slots.filter((s) => s.meal === "Breakfasts")).toHaveLength(7);
  });

  it("says when the budget is too low and gives the lowest possible", () => {
    const plan = buildPlan({ ...base, budget: 3, adults: 4 });
    expect(plan.overBudget).toBe(true);
    expect(plan.lowestPossible).toBeGreaterThan(3);
  });

  it("respects diet, leave-outs and allergens", () => {
    const plan = buildPlan({ ...base, budget: 80, diet: "vegan", exclude: ["mushroom"], avoidAllergens: ["peanuts"] });
    for (const { recipe } of plan.recipes) {
      expect(recipe.vegan).toBe(true);
      expect(recipe.allergens).not.toContain("peanuts");
      expect(JSON.stringify(recipe.ingredients).toLowerCase()).not.toContain("mushroom");
    }
  });

  it("sizes portions by household and leaves babies out", () => {
    expect(householdPortions(2, [15, 8, 2, 0])).toBeCloseTo(2 + 1 + 0.75 + 0.4);
    expect(buildPlan({ ...base, budget: 100, adults: 2, childAges: [0] }).babies).toBe(1);
  });

  it("a bigger budget brings more variety", () => {
    const low = buildPlan({ ...base, budget: 25 });
    const high = buildPlan({ ...base, budget: 120 });
    expect(high.recipes.length).toBeGreaterThanOrEqual(low.recipes.length);
  });

  it("ticking cupboard items you already have lowers the cost", () => {
    const plan = buildPlan({ ...base, budget: 60 });
    const cupboard = plan.shopping.filter((l) => l.cupboard).map((l) => l.key);
    const withHave = buildPlan({ ...base, budget: 60, have: cupboard, picks: plan.recipes.map((r) => r.recipe.id) });
    expect(withHave.weeklyCost).toBeLessThan(plan.weeklyCost);
  });

  it("keeps a chosen set of recipes when swapping", () => {
    const plan = buildPlan({ ...base, budget: 60 });
    const ids = plan.recipes.map((r) => r.recipe.id);
    const again = buildPlan({ ...base, budget: 60, picks: ids });
    expect(again.recipes.map((r) => r.recipe.id)).toEqual(ids);
    expect(suits(plan.recipes[0]!.recipe, base)).toBe(true);
  });

  it("reports realistic costs", () => {
    const summary = [20, 30, 40, 60, 100].map((b) => {
      const p = buildPlan({ ...base, budget: b });
      return `£${b}: £${p.weeklyCost.toFixed(2)} (${p.recipes.length} recipes, over=${p.overBudget})`;
    });
    const family = buildPlan({ ...base, budget: 90, adults: 2, childAges: [6, 10] });
    console.log(summary.join("\n"), `\nfamily £90: £${family.weeklyCost.toFixed(2)} (${family.recipes.length} recipes, over=${family.overBudget})`);
    const cheap = [...RECIPES].sort((a, b) => costPerPortion(a) - costPerPortion(b));
    console.log("cheapest", cheap.slice(0, 3).map((r) => `${r.name} £${costPerPortion(r).toFixed(2)}`), "dearest", cheap.slice(-3).map((r) => `${r.name} £${costPerPortion(r).toFixed(2)}`));
  });
});

describe("leftovers safety", () => {
  it("never plans fridge leftovers beyond 2 days (1 for rice): later portions are frozen", () => {
    for (const budget of [12, 20, 30]) {
      const plan = buildPlan({ ...base, budget, adults: 3 });
      for (const s of plan.slots.filter((x) => x.note)) {
        const cookDay = plan.slots.find((x) => x.recipe.id === s.recipe.id && x.cook)!.day;
        const rice = s.recipe.ingredients.some((i) => /\brice\b(?! (noodles|cakes|vinegar))/i.test(i.name));
        if (s.day - cookDay > (rice ? 1 : 2)) expect(s.freeze, `${s.recipe.name} day ${s.day}`).toBe(true);
      }
    }
  });
});

describe("personal prices", () => {
  it("raises the estimate when someone's real shop costs more", () => {
    const ids = buildPlan({ ...base, budget: 60 }).recipes.map((r) => r.recipe.id);
    const normal = buildPlan({ ...base, budget: 60, picks: ids });
    const dearer = buildPlan({ ...base, budget: 60, picks: ids, personalFactor: 1.2 });
    expect(dearer.weeklyCost).toBeCloseTo(normal.weeklyCost * 1.2, 1);
  });
});
