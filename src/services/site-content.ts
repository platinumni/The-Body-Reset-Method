import { COACH, FAQS, PHILOSOPHY, PROGRAMMES, placeholder, type Copy, type Faq } from "../content/site";
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

export const WORDING: WordingField[] = [
  { key: "home.headline", label: "Homepage headline", help: "Up to three short lines, one per line. The third line shows in italic.", multiline: true, defaultValue: PHILOSOPHY.headline.join("\n") },
  { key: "home.lede", label: "Homepage intro sentence", help: "Shown under the headline.", multiline: true, defaultValue: PHILOSOPHY.lede },
  { key: "coach.name", label: "Coach name", help: "Shown on the About page.", multiline: false, defaultValue: copyText(COACH.name) },
  { key: "coach.story", label: "Coach story", help: "Your story in your own words. Leave a blank line between paragraphs.", multiline: true, defaultValue: COACH.story.map(copyText).filter(Boolean).join("\n\n") },
  ...PROGRAMMES.map((p) => ({ key: `programme.${p.slug}.short`, label: `${p.title}: short description`, help: "One or two sentences, used on cards and the programme page.", multiline: true, defaultValue: p.short })),
  { key: "faqs", label: "FAQs", help: FAQ_FORMAT_HELP, multiline: true, defaultValue: faqsToText(FAQS) },
];

export async function loadSettings(db: D1Database): Promise<Map<string, string>> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return new Map(results.map((r) => [r.key, r.value]));
}

export type SiteContent = {
  headline: string[];
  lede: string;
  coachName: Copy;
  coachStory: Copy[];
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
    coachName: get("coach.name") ?? COACH.name ?? placeholder("Coach name"),
    coachStory: story?.length ? story : COACH.story,
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
