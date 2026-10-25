import assert from "node:assert/strict";
import { test } from "node:test";
import { allergensFor, build, dietProblems, parseRecipes } from "./build-recipes.mjs";

test("every catalogue recipe has a full draft and consistent diet labels", () => {
  const { recipes, problems } = build();
  assert.equal(recipes.length, 140);
  assert.deepEqual(problems, []);
  for (const r of recipes) {
    assert.ok(r.ingredients.length && r.method.length && r.serves > 0, r.id);
    assert.doesNotMatch(JSON.stringify(r), /\b(cures?|detox|burns? fat|boosts? immunity|anti-inflammatory)\b/i, r.id);
  }
});

test("parses the recipe format", () => {
  const [r] = parseRecipes("R 900 | serves 2 | prep 5 | cook 10\nI 2 | eggs\nI 1 tbsp | oil | c\nM Cook.\nN A note.");
  assert.deepEqual(r, { id: "900", serves: 2, prep_minutes: 5, cook_minutes: 10, ingredients: [{ amount: "2", name: "eggs", cupboard: false }, { amount: "1 tbsp", name: "oil", cupboard: true }], method: ["Cook."], notes: ["A note."] });
});

test("tags allergens and catches wrong diet labels", () => {
  assert.deepEqual(allergensFor([{ name: "tin butter beans" }, { name: "oat milk" }]), []);
  assert.deepEqual(allergensFor([{ name: "Greek yoghurt" }, { name: "king prawns" }]), ["crustaceans", "milk"]);
  assert.equal(dietProblems({ ingredients: [{ name: "honey" }] }, { vegan: true, vegetarian: true, pescatarian: true }).length, 1);
  assert.equal(dietProblems({ ingredients: [{ name: "Parmesan, grated" }] }, { vegan: false, vegetarian: true, pescatarian: true }).length, 1);
});
