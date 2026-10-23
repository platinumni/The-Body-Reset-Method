import { FAQS, PROGRAMMES, type Copy, type Faq, type Programme } from "../content/site";
import { formatPrice, isOnSale, listProducts, type Product } from "./products";

// Programme catalogue: descriptive content (static for now; database from Step 5)
// combined with what's on sale and at what price (always from the database).

export type CatalogueEntry = Programme & { product: Product | null; onSale: boolean; displayPrice: Copy };

function merge(p: Programme, products: Product[]): CatalogueEntry {
  const product = products.find((x) => x.slug === p.slug) ?? null;
  const onSale = !!product && isOnSale(product);
  return {
    ...p,
    product,
    onSale,
    displayPrice: onSale ? formatPrice(product!.price_pence!, product!.currency) : p.price,
  };
}

export async function listCatalogue(db: D1Database): Promise<CatalogueEntry[]> {
  const products = await listProducts(db);
  return [...PROGRAMMES].sort((a, b) => Number(!!b.flagship) - Number(!!a.flagship)).map((p) => merge(p, products));
}

export async function getCatalogueEntry(db: D1Database, slug: string): Promise<CatalogueEntry | null> {
  const p = PROGRAMMES.find((x) => x.slug === slug);
  return p ? merge(p, await listProducts(db)) : null;
}

/** Only programmes with their own page (coming-soon ones are listed, not linked). */
export function programmesWithPages(): Programme[] {
  return PROGRAMMES.filter((p) => p.status === "available");
}

export function listFaqs(): Faq[] {
  return FAQS;
}
