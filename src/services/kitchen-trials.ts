import { CHECKOUT_CONSENTS } from "../content/consents";
import { randomToken, sha256Hex } from "../lib/crypto";
import type { PlanInput } from "../lib/meal-plans/planner";
import { readPlanInput } from "./meal-plans";

// Body Regeneration Kitchen free week. The visitor sees their week straight away; the emailed
// link proves the address is theirs. Only verified addresses get the one follow-up email.

export type Trial = { id: number; email: string; input: PlanInput; weeklyPence: number; verified: boolean; geRef: string | null };

const storedInput = (i: PlanInput) => ({ budget: i.budget, country: i.country, store: i.store, adults: i.adults, children: i.childAges.join(","), diet: i.diet, exclude: i.exclude.join(","), snacks: i.snacks ? "yes" : "no", seed: i.seed, region: i.region ?? "national", style: (i.styles ?? []).join(","), submitted: "yes" });

export type StartTrialResult = { status: "new"; id: number; token: string } | { status: "exists"; id: number; token: string };

/** Save a free week. If this email already had one, a fresh link to the same week is made instead. */
export async function startTrial(db: D1Database, email: string, input: PlanInput, picks: string[], weeklyCost: number, opts: { marketing: boolean; geRef: string | null }): Promise<StartTrialResult> {
  const token = randomToken();
  const hash = await sha256Hex(token);
  const existing = await db.prepare("UPDATE kitchen_trials SET token_hash = ?2 WHERE email = ?1 RETURNING id").bind(email, hash).first<number>("id");
  if (existing) return { status: "exists", id: existing, token };
  const id = await db
    .prepare("INSERT INTO kitchen_trials (email, token_hash, inputs_json, picks, weekly_pence, marketing_opt_in, ge_ref) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id")
    .bind(email, hash, JSON.stringify(storedInput(input)), picks.join(","), Math.round(weeklyCost * 100), opts.marketing ? 1 : 0, opts.geRef)
    .first<number>("id");
  return { status: "new", id: id!, token };
}

/** Open a free week from its emailed link. The first open confirms the email (and any news opt-in). */
export async function openTrial(db: D1Database, token: string): Promise<(Trial & { firstOpen: boolean }) | null> {
  if (!/^[0-9a-f]{16,128}$/.test(token)) return null;
  const row = await db
    .prepare("SELECT id, email, inputs_json, picks, weekly_pence, marketing_opt_in, ge_ref, verified_at FROM kitchen_trials WHERE token_hash = ?1")
    .bind(await sha256Hex(token))
    .first<{ id: number; email: string; inputs_json: string; picks: string; weekly_pence: number; marketing_opt_in: number; ge_ref: string | null; verified_at: string | null }>();
  if (!row) return null;
  const firstOpen = !row.verified_at;
  if (firstOpen) {
    await db.prepare("UPDATE kitchen_trials SET verified_at = datetime('now') WHERE id = ?1 AND verified_at IS NULL").bind(row.id).run();
    if (row.marketing_opt_in) {
      await db
        .prepare(
          `INSERT INTO consents (email, kind, granted, wording_version, source)
           SELECT ?1, 'marketing_email', 1, ?2, 'signup:kitchen-free-week'
           WHERE NOT EXISTS (SELECT 1 FROM consents WHERE email = ?1 AND kind = 'marketing_email' AND source = 'signup:kitchen-free-week')`,
        )
        .bind(row.email, CHECKOUT_CONSENTS.marketing_email.version)
        .run();
    }
  }
  const input = readPlanInput({ ...JSON.parse(row.inputs_json), picks: row.picks });
  return { id: row.id, email: row.email, input, weeklyPence: row.weekly_pence, verified: true, geRef: row.ge_ref, firstOpen };
}

/** Verified free weeks that are a week old and haven't had their one follow-up yet. Claimed as they're returned. */
export async function claimDueFollowUps(db: D1Database, now = new Date()): Promise<{ id: number; email: string }[]> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const { results } = await db
    .prepare("SELECT id, email FROM kitchen_trials WHERE verified_at IS NOT NULL AND followup_sent_at IS NULL AND created_at <= ?1 LIMIT 200")
    .bind(cutoff)
    .all<{ id: number; email: string }>();
  const claimed: { id: number; email: string }[] = [];
  for (const r of results) {
    const res = await db.prepare("UPDATE kitchen_trials SET followup_sent_at = datetime('now') WHERE id = ?1 AND followup_sent_at IS NULL").bind(r.id).run();
    if (res.meta.changes === 1) claimed.push(r);
  }
  return claimed;
}

/** Owner's numbers: free weeks started, confirmed, and how many went on to join. */
export async function trialStats(db: D1Database): Promise<{ started: number; verified: number; joined: number }> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS started, COUNT(verified_at) AS verified,
        (SELECT COUNT(DISTINCT t.email) FROM kitchen_trials t JOIN entitlements e ON e.email = t.email JOIN products p ON p.id = e.product_id WHERE p.slug = 'meal-plans') AS joined
       FROM kitchen_trials`,
    )
    .first<{ started: number; verified: number; joined: number }>();
  return row ?? { started: 0, verified: 0, joined: 0 };
}
