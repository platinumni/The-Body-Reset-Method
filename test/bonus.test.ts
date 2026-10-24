import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { loadBasket } from "../src/services/basket";
import { programmesUnlockedBy, type Product } from "../src/services/products";
import { productId } from "./helpers";

const product = (slug: string) => env.DB.prepare("SELECT * FROM products WHERE slug = ?1").bind(slug).first<Product>().then((p) => p!);

describe("Core & Hips", () => {
  it("Lower Body unlocks itself plus Hips and Core free", async () => {
    const ids = await programmesUnlockedBy(env.DB, await product("lower-body-regeneration"));
    expect(ids[0]).toBe(await productId(env.DB, "lower-body-regeneration"));
    expect(ids.sort()).toEqual([await productId(env.DB, "lower-body-regeneration"), await productId(env.DB, "hips"), await productId(env.DB, "core")].sort());
  });

  it("the Core & Hips bundle unlocks Hips and Core, and each can still be sold alone", async () => {
    const ids = await programmesUnlockedBy(env.DB, await product("core-and-hips"));
    expect(ids.sort()).toEqual([await productId(env.DB, "hips"), await productId(env.DB, "core")].sort());
    expect(await programmesUnlockedBy(env.DB, await product("core"))).toEqual([await productId(env.DB, "core")]);
  });

  it("the basket doesn't suggest Core & Hips to someone already buying Lower Body", async () => {
    await env.DB.prepare("UPDATE products SET status = 'on_sale', price_pence = 1000 WHERE slug IN ('lower-body-regeneration', 'core-and-hips', 'core', 'hips')").run();
    try {
      const basket = await loadBasket(env.DB, ["lower-body-regeneration"]);
      const suggested = basket.addOns.map((p) => p.slug);
      expect(suggested).not.toContain("core-and-hips");
      expect(suggested).not.toContain("core");
      expect(suggested).not.toContain("hips");
      expect((await loadBasket(env.DB, ["core"])).addOns.map((p) => p.slug)).toContain("lower-body-regeneration");
    } finally {
      await env.DB.prepare("UPDATE products SET status = 'draft', price_pence = NULL WHERE slug IN ('lower-body-regeneration', 'core-and-hips', 'core', 'hips')").run();
    }
  });
});
