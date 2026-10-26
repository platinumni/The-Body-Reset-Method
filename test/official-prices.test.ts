import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import sources from "../content/meal-plans/official-sources.json";
import { BUNDLED_PRICES, fetchCa, fetchUk, priceBook, regionsFor } from "../src/lib/meal-plans/official";
import { buildPlan, type PlanInput } from "../src/lib/meal-plans/planner";
import { PRICE_ITEMS } from "../src/lib/meal-plans/prices";
import { loadOfficialPrices, refreshOfficialPrices } from "../src/services/official-prices";

const base: PlanInput = { budget: 60, country: "uk", store: "mid", adults: 1, childAges: [], diet: "any", exclude: [], avoidAllergens: [], snacks: true, seed: 1, have: [] };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

describe("official prices", () => {
  it("every mapped ingredient exists in the price list", () => {
    const keys = new Set(PRICE_ITEMS.map((p) => p.key));
    const mapped = [...sources.uk.series.map((s) => s.key), ...sources.us.series.map((s) => s.key), ...sources.ca.products.map((p) => p.key)];
    expect(mapped.filter((k) => !keys.has(k))).toEqual([]);
  });

  it("the bundled copy has current UK and Canadian prices", () => {
    expect(BUNDLED_PRICES.uk?.period).toBeTruthy();
    expect(Object.keys(BUNDLED_PRICES.uk!.regions.national!).length).toBeGreaterThan(15);
    expect(regionsFor(BUNDLED_PRICES, "ca")).toContain("Ontario");
    expect(regionsFor(BUNDLED_PRICES, "us")).toEqual(["northeast", "midwest", "south", "west"]);
  });

  it("uses official prices in the plan, and regional ones over national", () => {
    const book = { official: { eggs: 10 }, estimateAdjust: 1, source: "Test", period: "2026 SEP", note: "test", region: "national" };
    const ids = buildPlan(base).recipes.map((r) => r.recipe.id);
    const plain = buildPlan({ ...base, picks: ids });
    const withBook = buildPlan({ ...base, picks: ids, book });
    const eggs = withBook.shopping.find((l) => l.key === "eggs");
    if (eggs) {
      expect(eggs.official).toBe(true);
      expect(eggs.cost).toBeCloseTo(10 * eggs.packs, 2);
      expect(withBook.weeklyCost).not.toBe(plain.weeklyCost);
    }
    const ca = priceBook({ fetchedAt: "x", ca: { source: "S", period: "p", note: "n", estimateAdjust: 1, regions: { national: { eggs: 2, milk: 3 }, Ontario: { eggs: 2.5 } } } }, "ca", "Ontario");
    expect(ca.official).toEqual({ eggs: 2.5, milk: 3 });
    expect(priceBook(BUNDLED_PRICES, "ca", "Atlantis").region).toBe("national");
  });

  it("brings UK prices up to date with the food index", async () => {
    const fake = (async (url: string) => {
      if (url.includes("/d7c8/")) return json({ months: [{ date: "2025 JAN", value: "100" }, { date: "2026 SEP", value: "110" }] });
      return json({ months: [{ date: "2025 JAN", value: "200" }] });
    }) as unknown as typeof fetch;
    const uk = await fetchUk(fake);
    expect(uk.period).toBe("2026 SEP");
    expect(uk.regions.national!.carrots).toBeCloseTo(2 * 1 * 1.1, 2);
    expect(uk.regions.national!.eggs).toBeCloseTo(2 * 0.5 * 1.1, 2);
    expect(uk.estimateAdjust).toBe(1);
  });

  it("matches Canadian results by vector, whatever order they come back in", async () => {
    const egg = sources.ca.products.find((p) => p.key === "eggs")!;
    const vectors = egg.vectors as Record<string, number>;
    const fake = (async (_url: string, init?: RequestInit) => {
      const asked = JSON.parse(String(init!.body)) as { vectorId: number }[];
      return json(
        asked.reverse().map((a) => ({ status: "SUCCESS", object: { vectorId: a.vectorId, vectorDataPoint: [{ refPer: "2026-08-01", value: a.vectorId === vectors.Canada ? 4 : a.vectorId === vectors.Ontario ? 5 : 1 }] } })),
      );
    }) as unknown as typeof fetch;
    const ca = await fetchCa(fake);
    expect(ca.regions.national!.eggs).toBe(2);
    expect(ca.regions.Ontario!.eggs).toBe(2.5);
  });

  it("refreshes into settings, keeping a country's previous prices if it fails", async () => {
    const fake = (async (url: string) => {
      if (url.includes("ons.gov.uk")) return json({ months: [{ date: "2025 JAN", value: "100" }, { date: "2026 OCT", value: "120" }] });
      return new Response("down", { status: 503 });
    }) as unknown as typeof fetch;
    const result = await refreshOfficialPrices(env, fake, true);
    expect(result.uk).toBe("updated to 2026 OCT");
    expect(result.ca).toMatch(/kept previous/);
    const prices = await loadOfficialPrices(env.DB);
    expect(prices.uk?.period).toBe("2026 OCT");
    expect(prices.ca?.period).toBe(BUNDLED_PRICES.ca?.period);
    expect((await refreshOfficialPrices(env, fake)).skipped).toBeTruthy();
  });
});
