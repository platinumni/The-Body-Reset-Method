import { FAQS, PROGRAMMES, type Faq, type Programme } from "../content/site";

// Programme catalogue and FAQs. Static content for now; from Step 5 this reads the
// database instead, and routes and views don't need to change.

export function listProgrammes(): Programme[] {
  return [...PROGRAMMES].sort((a, b) => Number(!!b.flagship) - Number(!!a.flagship));
}

export function getProgramme(slug: string): Programme | null {
  return PROGRAMMES.find((p) => p.slug === slug) ?? null;
}

/** Only programmes with their own page (coming-soon ones are listed, not linked). */
export function programmesWithPages(): Programme[] {
  return PROGRAMMES.filter((p) => p.status === "available");
}

export function listFaqs(): Faq[] {
  return FAQS;
}
