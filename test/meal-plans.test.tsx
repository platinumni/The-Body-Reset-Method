import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createEmailToken } from "../src/services/email-tokens";
import { productId, TestClient } from "./helpers";

const PW = "a long enough password";
let seq = 0;

async function member(withMealPlans: boolean) {
  const email = `meals${++seq}-${Date.now()}@example.com`;
  const order = await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json) VALUES (?1, ?2, 'paid', 100, '{}') RETURNING id").bind(`M-${crypto.randomUUID()}`, email).first<number>("id");
  const slug = withMealPlans ? "meal-plans" : "hips";
  await env.DB.prepare("INSERT INTO entitlements (email, product_id, order_id) VALUES (?1, ?2, ?3)").bind(email, await productId(env.DB, slug), order).run();
  const token = await createEmailToken(env.DB, "setup", email, order);
  const client = new TestClient(env);
  await client.post("/account/setup", { token, password: PW, confirm: PW });
  return client;
}

describe("budget meal plans", () => {
  it("is only for members who own it", async () => {
    const res = await (await member(false)).get("/account/meal-plans");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/programmes/meal-plans");
  });

  it("shows the form first, then a plan within budget with recipes, shopping list and notes", async () => {
    const client = await member(true);
    const first = await (await client.get("/account/meal-plans")).text();
    expect(first).toContain("Make my plan");
    expect(first).not.toContain("The week at a glance");

    const html = await (await client.get("/account/meal-plans?submitted=yes&budget=40&country=uk&store=mid&adults=1&diet=vegetarian&snacks=yes")).text();
    expect(html).toContain("The week at a glance");
    expect(html).toMatch(/Estimated <strong>£\d+\.\d\d<\/strong> of your £40\.00 budget/);
    expect(html).toContain("Shopping list");
    expect(html).toContain("maintain your current weight");
    expect(html).toContain("Always check product labels");
    expect(html).toContain("use official average prices from Office for National Statistics");
    expect(html).toContain("Download PDF");
    expect(html).not.toMatch(/<h3>[^<]*(Chicken|Beef|Salmon|Prawn)/);
  });

  it("explains when the budget is too low", async () => {
    const client = await member(true);
    const html = await (await client.get("/account/meal-plans?submitted=yes&budget=10&adults=6")).text();
    expect(html).toContain("The lowest-cost week we can make right now");
  });

  it("remembers choices when asked", async () => {
    const client = await member(true);
    const page = await (await client.get("/account/meal-plans?submitted=yes&budget=55&diet=vegan&adults=2")).text();
    const query = /name="query" value="([^"]+)"/.exec(page)![1]!.replace(/&amp;/g, "&");
    const res = await client.post("/account/meal-plans/save", { query });
    expect(res.status).toBe(303);
    const again = await (await client.get("/account/meal-plans")).text();
    expect(again).toContain('value="55"');
    expect(again).toMatch(/value="vegan" checked/);
  });

  it("has a public product page without the movement note", async () => {
    const html = await (await new TestClient(env).get("/programmes/meal-plans")).text();
    expect(html).toContain("Budget Meal Plans");
    expect(html).not.toContain("flagship-pointer");
  });
});

describe("meal plan savings", () => {
  it("shows what you could save against your usual shop", async () => {
    const client = await member(true);
    const html = await (await client.get("/account/meal-plans?submitted=yes&budget=40&usual=90")).text();
    expect(html).toMatch(/Compared with your usual £90\.00, you could save about <strong>£\d+\.\d\d<\/strong> this week/);
  });

  it("records what you actually paid, keeps a running total and never saves allergies", async () => {
    const client = await member(true);
    const page = await (await client.get("/account/meal-plans?submitted=yes&budget=40&usual=70&allergens=peanuts")).text();
    const query = /name="query" value="([^"]+)"/.exec(page)![1]!.replace(/&amp;/g, "&");
    const res = await client.post("/account/meal-plans/spend", { query, planned: "38.50", actual: "45.00" });
    expect(res.status).toBe(303);
    const after = await (await client.get(res.headers.get("location")!)).text();
    expect(after).toMatch(/You(&#39;|')ve logged 1 week\./);
    expect(after).toMatch(/you(&#39;|')ve spent about <strong>£25\.00<\/strong> less/);
    expect(after).toContain("about 17% above our estimates");

    await client.post("/account/meal-plans/save", { query });
    const saved = await env.DB.prepare("SELECT prefs_json FROM meal_plan_prefs ORDER BY rowid DESC LIMIT 1").first<string>("prefs_json");
    expect(JSON.parse(saved!).avoidAllergens).toEqual([]);
    expect(JSON.parse(saved!).usual).toBe(70);
  });
});

describe("guarantee", () => {
  it("doesn't offer the 90-day guarantee on meal plans", async () => {
    const html = await (await new TestClient(env).get("/programmes/meal-plans")).text();
    expect(html).not.toContain("90-day money-back guarantee");
    const flagship = await (await new TestClient(env).get("/programmes/lower-body-regeneration")).text();
    expect(flagship).toContain("90-day money-back guarantee");
    const refunds = await (await new TestClient(env).get("/legal/refunds")).text();
    expect(refunds).toContain("Budget Meal Plans are not covered by this guarantee");
  });
});

describe("kitchen and calories", () => {
  it("has a Kitchen landing page with a sample week and no guarantee", async () => {
    const res = await new TestClient(env).get("/kitchen");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Body Regeneration Kitchen · part of The Body Regeneration Method");
    expect(html).toContain("A sample week for one adult, on £30");
    expect(html).toContain('rel="canonical" href="http://localhost:8787/kitchen"');
    expect(html).not.toContain("90-day money-back guarantee</li>");
  });

  it("offers an optional calorie estimate, worked out on the device", async () => {
    const client = await member(true);
    const html = await (await client.get("/account/meal-plans")).text();
    expect(html).toContain("data-calorie-calc");
    expect(html).toContain("never saved");
    const js = await (await new TestClient(env).get("/reader.js")).text();
    expect(js).toContain("Mifflin-St Jeor");
  });
});
