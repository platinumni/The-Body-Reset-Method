// Products that can be bought, and what each one unlocks.

export type Product = {
  id: number;
  slug: string;
  title: string;
  kind: "programme" | "bundle";
  price_pence: number | null;
  currency: string;
  status: "draft" | "on_sale" | "archived";
  sort_order: number;
};

const COLUMNS = "id, slug, title, kind, price_pence, currency, status, sort_order";

export async function listProducts(db: D1Database): Promise<Product[]> {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM products ORDER BY sort_order, id`).all<Product>();
  return results;
}

/** On sale = status on_sale AND a price set. A product never goes on sale without a real price. */
export const isOnSale = (p: Product) => p.status === "on_sale" && p.price_pence != null;

export async function listOnSale(db: D1Database): Promise<Product[]> {
  return (await listProducts(db)).filter(isOnSale);
}

export async function getProductsBySlugs(db: D1Database, slugs: string[]): Promise<Product[]> {
  if (!slugs.length) return [];
  const marks = slugs.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM products WHERE slug IN (${marks})`).bind(...slugs).all<Product>();
  return results;
}

/** The programme ids a product unlocks: itself, or a bundle's contents. */
export async function programmesUnlockedBy(db: D1Database, product: Pick<Product, "id" | "kind">): Promise<number[]> {
  if (product.kind === "programme") return [product.id];
  const { results } = await db
    .prepare("SELECT bi.product_id FROM bundle_items bi JOIN products p ON p.id = bi.product_id WHERE bi.bundle_id = ?1 AND p.kind = 'programme'")
    .bind(product.id)
    .all<{ product_id: number }>();
  return results.map((r) => r.product_id);
}

export function formatPrice(pence: number, currency = "gbp"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(pence / 100);
}
