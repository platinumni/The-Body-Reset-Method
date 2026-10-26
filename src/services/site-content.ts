import { COACH, FAQS, PHILOSOPHY, PROGRAMMES, TRACK_RECORD, placeholder, type Copy, type Faq } from "../content/site";
import { recordAudit } from "./audit";
import type { Actor } from "./admin-content";
import { saveRevisionStmt } from "./revisions";

// Site wording the owner can edit in admin. Each item has a default from
// src/content/site.ts; a saved value in the settings table overrides it.

export type WordingField = { key: string; label: string; help: string; multiline: boolean; defaultValue: string };

// Unconfirmed defaults become visible "[PLACEHOLDER: …]" text in the editor, and stay highlighted on the site.
const copyText = (c: Copy) => (typeof c === "string" ? c : `[PLACEHOLDER: ${c.placeholder}]`);

export const FAQ_FORMAT_HELP = "One question per block: a line starting 'Q:' then a line starting 'A:'. Leave a blank line between questions.";

export const faqsToText = (faqs: Faq[]) => faqs.map((f) => `Q: ${f.q}\nA: ${f.a.map(copyText).join(" ")}`).join("\n\n");

export function parseFaqText(text: string): Faq[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => {
      const q = /^Q:\s*(.+)$/im.exec(block)?.[1]?.trim();
      const a = /^A:\s*([\s\S]+)$/im.exec(block)?.[1]?.replace(/\s*\n\s*/g, " ").trim();
      return q && a ? ({ q, a: [a] } as Faq) : null;
    })
    .filter((f): f is Faq => f !== null);
}

export type Testimonial = { quote: string; who: string; rating?: number; /** e.g. "Given free access as a beta tester" (required by law when it applies). */ note?: string };

export function parseTestimonials(text: string): Testimonial[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const whoLine = lines.findIndex((l) => /^[-–—]\s*/.test(l));
      if (whoLine <= 0) return null;
      const quote = lines.slice(0, whoLine).join(" ").replace(/^["“]|["”]$/g, "");
      return { quote, who: lines[whoLine]!.replace(/^[-–—]\s*/, "") };
    })
    .filter((t): t is Testimonial => t !== null);
}

export const WORDING: WordingField[] = [
  { key: "home.headline", label: "Homepage headline", help: "One or two lines. The second line shows in italic.", multiline: true, defaultValue: PHILOSOPHY.headline.join("\n") },
  { key: "home.lede", label: "Homepage intro sentence", help: "Shown under the headline.", multiline: true, defaultValue: PHILOSOPHY.lede },
  { key: "home.track_record", label: "Track record line", help: "Shown under the homepage intro and on the flagship page. Only use numbers you can back up.", multiline: false, defaultValue: TRACK_RECORD },
  { key: "coach.name", label: "Coach name", help: "Shown on the About page.", multiline: false, defaultValue: copyText(COACH.name) },
  { key: "coach.story", label: "Coach story", help: "Your story in your own words. Leave a blank line between paragraphs.", multiline: true, defaultValue: COACH.story.map(copyText).filter(Boolean).join("\n\n") },
  ...PROGRAMMES.map((p) => ({ key: `programme.${p.slug}.short`, label: `${p.title}: short description`, help: "One or two sentences, used on cards and the programme page.", multiline: true, defaultValue: p.short })),
  { key: "offer.headline", label: "Sign-up offer: headline (optional)", help: "e.g. '10% off your first programme'. Leave empty for no offer. Create the matching code in Stripe → Product catalogue → Coupons.", multiline: false, defaultValue: "" },
  { key: "offer.code", label: "Sign-up offer: discount code", help: "Exactly as created in Stripe, e.g. WELCOME10. Sent in the welcome email.", multiline: false, defaultValue: "" },
  { key: "offer.details", label: "Sign-up offer: small print (optional)", help: "e.g. 'One use per customer. Ends 31 December.'", multiline: false, defaultValue: "" },
  { key: "testimonials", label: "Testimonials (real ones only, with permission)", help: "One per block: the quote on the first line, then a line starting with a dash for who said it, e.g. '- Sarah, Belfast'. Leave a blank line between them. The section only appears once there's at least one.", multiline: true, defaultValue: "" },
  { key: "contact.email", label: "Contact form: send messages to", help: "The email address that receives contact form messages, e.g. your Gmail. Until it's set (and email sending is switched on), messages are kept safely in Admin → Messages.", multiline: false, defaultValue: "" },
  { key: "faqs", label: "FAQs", help: FAQ_FORMAT_HELP, multiline: true, defaultValue: faqsToText(FAQS) },
];

export async function loadSettings(db: D1Database): Promise<Map<string, string>> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return new Map(results.map((r) => [r.key, r.value]));
}

export type SiteContent = {
  headline: string[];
  lede: string;
  trackRecord: string;
  coachName: Copy;
  coachStory: Copy[];
  offer: { headline: string; code: string | null; details: string | null } | null;
  testimonials: Testimonial[];
  faqs: Faq[];
  programmeShort: (slug: string, fallback: string) => string;
};

/** The wording to show, with the owner's saved edits applied over the defaults. */
export async function loadSiteContent(db: D1Database): Promise<SiteContent> {
  const s = await loadSettings(db);
  const get = (k: string) => s.get(k)?.trim() || null;
  const headline = get("home.headline")?.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const story = get("coach.story")?.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const faqs = get("faqs") ? parseFaqText(get("faqs")!) : null;
  return {
    headline: headline?.length ? headline : PHILOSOPHY.headline,
    lede: get("home.lede") ?? PHILOSOPHY.lede,
    trackRecord: get("home.track_record") ?? TRACK_RECORD,
    coachName: get("coach.name") ?? COACH.name ?? placeholder("Coach name"),
    coachStory: story?.length ? story : COACH.story,
    offer: get("offer.headline") ? { headline: get("offer.headline")!, code: get("offer.code"), details: get("offer.details") } : null,
    testimonials: parseTestimonials(get("testimonials") ?? ""),
    faqs: faqs?.length ? faqs : FAQS,
    programmeShort: (slug, fallback) => get(`programme.${slug}.short`) ?? fallback,
  };
}

export async function saveWording(db: D1Database, values: Record<string, string>, actor: Actor): Promise<string[]> {
  const current = await loadSettings(db);
  const changed: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const field of WORDING) {
    if (!(field.key in values)) continue;
    const next = (values[field.key] ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 20_000);
    const before = current.get(field.key) ?? "";
    // Saving the default unchanged isn't an edit.
    if (next === before || (!before && next === field.defaultValue.trim())) continue;
    changed.push(field.key);
    stmts.push(saveRevisionStmt(db, "setting", field.key, { value: before }, actor.userId));
    stmts.push(
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(field.key, next),
    );
  }
  if (stmts.length) await db.batch(stmts);
  if (changed.length) await recordAudit(db, { actorUserId: actor.userId, action: "wording.update", targetType: "settings", ip: actor.ip, detail: { keys: changed } });
  return changed;
}
