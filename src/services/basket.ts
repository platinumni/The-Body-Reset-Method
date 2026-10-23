import { getProductsBySlugs, isOnSale, listOnSale, programmesUnlockedBy, type Product } from "./products";

// The basket is a short list of product slugs kept in a cookie. Prices are always
// looked up fresh from the database, so editing the cookie can't change what anyone pays.

export const BASKET_COOKIE = "brm_basket";
const MAX_ITEMS = 20;
const SLUG = /^[a-z0-9-]{1,64}$/;

export function parseBasket(cookie: string | undefined): string[] {
  if (!cookie) return [];
  const slugs = cookie.split(",").filter((s) => SLUG.test(s));
  return [...new Set(slugs)].slice(0, MAX_ITEMS);
}

export const serializeBasket = (slugs: string[]) => [...new Set(slugs)].slice(0, MAX_ITEMS).join(",");

export type Basket = {
  items: Product[];
  totalPence: number;
  currency: string;
  /** Other products worth suggesting: on sale, not in the basket, not already covered by a bundle in it. */
  addOns: Product[];
};

export async function loadBasket(db: D1Database, slugs: string[]): Promise<Basket> {
  const found = await getProductsBySlugs(db, slugs);
  // Keep the shopper's order; drop anything no longer on sale.
  const items = slugs.map((s) => found.find((p) => p.slug === s)).filter((p): p is Product => !!p && isOnSale(p));

  const covered = new Set<number>();
  for (const item of items) for (const id of await programmesUnlockedBy(db, item)) covered.add(id);
  const inBasket = new Set(items.map((i) => i.id));
  const addOns = (await listOnSale(db)).filter((p) => !inBasket.has(p.id) && !(p.kind === "programme" && covered.has(p.id)));

  return {
    items,
    totalPence: items.reduce((sum, i) => sum + (i.price_pence ?? 0), 0),
    currency: items[0]?.currency ?? "gbp",
    addOns,
  };
}
