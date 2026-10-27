import assert from "node:assert/strict";
import { test } from "node:test";
import { allergensFor, build, dietProblems, parseRecipes } from "./build-recipes.mjs";

test("every catalogue recipe has a full draft and consistent diet labels", () => {
  const { recipes, problems } = build();
  assert.equal(recipes.length, 168); // the owner's 140, less 57 taken out, plus 85 family, fakeaway and snack favourites (2026-10-27)
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

// --- ONS price quotes (scripts/build-ons-quotes.mjs) ---
import { median as onsMedian, parseCsvLine, summarise as onsSummarise } from "./build-ons-quotes.mjs";

test("ONS quotes: parses quoted CSV and takes the median of valid prices, by region", () => {
  assert.deepEqual(parseCsvLine('202601,CP01,"BREAD, WHITE",210102,X'), ["202601", "CP01", "BREAD, WHITE", "210102", "X"]);
  assert.equal(onsMedian([3, 1, 2]), 2);
  assert.equal(onsMedian([1, 2, 3, 4]), 2.5);
  const head = "QUOTE_DATE,CS_ID,CS_DESC,ITEM_ID,ITEM_DESC,VALIDITY,SHOP_CODE,PRICE,REGION";
  const rows = Array.from({ length: 9 }, (_, i) => `202601,C,"EGGS",211604,EGGS DOZEN,TRUE,1,${3 + i * 0.1},13`);
  rows.push("202601,C,EGGS,211604,EGGS DOZEN,FALSE,1,99,13", "202601,C,EGGS,211604,EGGS DOZEN,TRUE,1,5,2", "202601,C,MILK,211709,MILK,TRUE,1,1,2");
  const out = onsSummarise([head, ...rows].join("\n"), new Set(["211604"]));
  assert.equal(out.period, "202601");
  assert.equal(out.items["211604"].quotes, 10);
  assert.equal(out.items["211604"].regions["Northern Ireland"], 3.4);
  assert.equal(out.items["211604"].regions.London, undefined); // too few quotes for a regional price
  assert.equal(out.items["211709"], undefined);
});
