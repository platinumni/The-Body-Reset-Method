import { CHECKOUT_CONSENTS } from "../content/consents";
import { randomToken, sha256Hex } from "../lib/crypto";
import type { Actor } from "./admin-content";
import { recordAudit } from "./audit";
import { createEmailToken } from "./email-tokens";
import { programmesUnlockedBy } from "./products";

// Access codes: partner codes (an organisation pays; its members unlock access) and beta codes
// (free access for testers). Using a code needs the email confirmed first, so nobody can use up
// a code with someone else's address.

export type CodeKind = "partner" | "beta";
export type AccessCode = {
  id: number;
  code: string;
  kind: CodeKind;
  label: string;
  product_slugs: string;
  max_uses: number | null;
  uses: number;
  status: "active" | "paused" | "ended";
  monthly_fee_pence: number | null;
  affiliate_id: number | null;
  note: string | null;
  created_at: string;
};

export const ACCESS_CODE_PATTERN = /^[A-Za-z0-9-]{4,24}$/;
const COLS = "id, code, kind, label, product_slugs, max_uses, uses, status, monthly_fee_pence, affiliate_id, note, created_at";
/** The consents someone gives to use a code (no payment, so no cancellation-rights tick). */
export const CODE_CONSENTS = ["health_declaration", "terms"] as const;

export type CodeInput = { code: string; kind: CodeKind; label: string; slugs: string[]; maxUses: number | null; monthlyFeePence: number | null; affiliateCode: string; note: string };

export function codeProblem(i: CodeInput, knownSlugs: string[]): string | null {
  if (!ACCESS_CODE_PATTERN.test(i.code)) return "Codes are 4-24 letters, numbers or dashes, e.g. GYM-ACME.";
  if (!i.label.trim()) return "Add the organisation or group name.";
  if (!i.slugs.length || i.slugs.some((s) => !knownSlugs.includes(s))) return "Choose what the code unlocks.";
  if (i.maxUses !== null && (!Number.isInteger(i.maxUses) || i.maxUses < 1 || i.maxUses > 100_000)) return "Maximum uses must be a whole number, or empty for no limit.";
  return null;
}

export async function createAccessCode(db: D1Database, i: CodeInput, actor: Actor): Promise<string | null> {
  if (await db.prepare("SELECT 1 FROM access_codes WHERE code = ?1").bind(i.code).first()) return "That code is already in use. Choose another.";
  const affiliateId = i.affiliateCode.trim() ? await db.prepare("SELECT id FROM affiliates WHERE code = ?1").bind(i.affiliateCode.trim().toLowerCase()).first<number>("id") : null;
  if (i.affiliateCode.trim() && !affiliateId) return "No partner has that share code.";
  await db
    .prepare("INSERT INTO access_codes (code, kind, label, product_slugs, max_uses, monthly_fee_pence, affiliate_id, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(i.code.toUpperCase(), i.kind, i.label.trim().slice(0, 100), i.slugs.join(","), i.maxUses, i.monthlyFeePence, affiliateId, i.note.trim().slice(0, 500) || null)
    .run();
  await recordAudit(db, { actorUserId: actor.userId, action: "code.create", targetType: "access_code", targetId: i.code.toUpperCase(), ip: actor.ip, detail: { kind: i.kind, label: i.label, slugs: i.slugs, maxUses: i.maxUses } });
  return null;
}

export async function getActiveCode(db: D1Database, code: string): Promise<AccessCode | null> {
  if (!ACCESS_CODE_PATTERN.test(code)) return null;
  const row = await db.prepare(`SELECT ${COLS} FROM access_codes WHERE code = ?1 AND status = 'active'`).bind(code).first<AccessCode>();
  return row && (row.max_uses === null || row.uses < row.max_uses) ? row : null;
}

/** Start using a code: saves the request and returns a token for the confirmation email, or null if the code can't be used. */
export async function requestClaim(db: D1Database, code: string, email: string, consents: Record<string, boolean>, geRef: string | null): Promise<{ token: string; code: AccessCode } | null> {
  const ac = await getActiveCode(db, code);
  if (!ac) return null;
  const token = randomToken();
  const snapshot = Object.fromEntries(CODE_CONSENTS.map((k) => [k, { given: !!consents[k], version: CHECKOUT_CONSENTS[k].version }]));
  await db.prepare("INSERT INTO access_code_claims (code_id, email, token_hash, consents, ge_ref) VALUES (?1, ?2, ?3, ?4, ?5)").bind(ac.id, email, await sha256Hex(token), JSON.stringify(snapshot), geRef).run();
  return { token, code: ac };
}

export type ClaimResult =
  | { outcome: "claimed"; email: string; code: AccessCode; setupToken: string | null; claimId: number; geRef: string | null }
  | { outcome: "already"; email: string; setupToken: string | null }
  | { outcome: "invalid" | "used-up" };

/** The emailed link was clicked: give access (once), record consents, and make an account-setup link if needed. */
export async function confirmClaim(db: D1Database, token: string): Promise<ClaimResult> {
  if (!/^[0-9a-f]{16,128}$/.test(token)) return { outcome: "invalid" };
  const claim = await db
    .prepare("SELECT id, code_id, email, consents, ge_ref, claimed_at FROM access_code_claims WHERE token_hash = ?1 AND created_at > datetime('now', '-7 days')")
    .bind(await sha256Hex(token))
    .first<{ id: number; code_id: number; email: string; consents: string; ge_ref: string | null; claimed_at: string | null }>();
  if (!claim) return { outcome: "invalid" };
  const user = await db.prepare("SELECT id, password_hash FROM users WHERE email = ?1 AND deleted_at IS NULL").bind(claim.email).first<{ id: number; password_hash: string | null }>();
  const setupLink = async (orderId: number | null) => (user?.password_hash ? null : await createEmailToken(db, "setup", claim.email, orderId));
  if (claim.claimed_at) return { outcome: "already", email: claim.email, setupToken: await setupLink(null) };

  const ac = await db.prepare(`SELECT ${COLS} FROM access_codes WHERE id = ?1`).bind(claim.code_id).first<AccessCode>();
  if (!ac || ac.status !== "active") return { outcome: "used-up" };
  // Same person, same code, already used: don't count it twice.
  const before = await db.prepare("SELECT 1 FROM access_code_claims WHERE code_id = ?1 AND email = ?2 AND claimed_at IS NOT NULL").bind(ac.id, claim.email).first();
  if (before) {
    await db.prepare("UPDATE access_code_claims SET claimed_at = datetime('now') WHERE id = ?1").bind(claim.id).run();
    return { outcome: "already", email: claim.email, setupToken: await setupLink(null) };
  }
  // Count the use only if there's room (safe against two people at once).
  const counted = await db.prepare("UPDATE access_codes SET uses = uses + 1 WHERE id = ?1 AND status = 'active' AND (max_uses IS NULL OR uses < max_uses)").bind(ac.id).run();
  if (counted.meta.changes !== 1) return { outcome: "used-up" };
  const marked = await db.prepare("UPDATE access_code_claims SET claimed_at = datetime('now') WHERE id = ?1 AND claimed_at IS NULL").bind(claim.id).run();
  if (marked.meta.changes !== 1) return { outcome: "already", email: claim.email, setupToken: await setupLink(null) };

  const publicId = `CODE-${randomToken(5).toUpperCase()}`;
  const orderId = (await db
    .prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json, paid_at, access_code, ge_ref) VALUES (?1, ?2, 'paid', 0, ?3, datetime('now'), ?4, ?5) RETURNING id")
    .bind(publicId, claim.email, claim.consents, ac.code, claim.ge_ref)
    .first<number>("id"))!;
  const slugs = ac.product_slugs.split(",").filter(Boolean);
  const products = (await db.prepare(`SELECT id, title, kind FROM products WHERE slug IN (${slugs.map((_, n) => `?${n + 1}`).join(",")})`).bind(...slugs).all<{ id: number; title: string; kind: "programme" | "bundle" }>()).results;
  const programmeIds = new Set<number>();
  for (const p of products) for (const id of await programmesUnlockedBy(db, p)) programmeIds.add(id);
  const consents = JSON.parse(claim.consents) as Record<string, { given: boolean; version: string }>;
  await db.batch([
    db.prepare("UPDATE access_code_claims SET order_id = ?1 WHERE id = ?2").bind(orderId, claim.id),
    ...products.map((p) => db.prepare("INSERT INTO order_items (order_id, product_id, title, price_pence) VALUES (?1, ?2, ?3, 0)").bind(orderId, p.id, p.title)),
    ...[...programmeIds].map((pid) => db.prepare("INSERT INTO entitlements (email, user_id, product_id, order_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING").bind(claim.email, user?.id ?? null, pid, orderId)),
    ...CODE_CONSENTS.map((k) =>
      db.prepare("INSERT INTO consents (user_id, email, kind, granted, wording_version, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(user?.id ?? null, claim.email, k, consents[k]?.given ? 1 : 0, consents[k]?.version ?? "unknown", `code:${publicId}`),
    ),
  ]);
  // A code linked to a commission partner: the partner is credited with this customer's later purchases.
  if (ac.affiliate_id) {
    await db.prepare("INSERT INTO referred_customers (email, affiliate_id, first_order_id) VALUES (?1, ?2, ?3) ON CONFLICT (email) DO NOTHING").bind(claim.email, ac.affiliate_id, orderId).run();
  }
  return { outcome: "claimed", email: claim.email, code: ac, setupToken: await setupLink(orderId), claimId: claim.id, geRef: claim.ge_ref };
}

export type CodeReport = AccessCode & { requested: number; members: number; active30: number; laterSales: number; laterSalesPence: number; affiliate_code: string | null };

/** Every code with its results: people who joined with it, how many used the programme in the last 30 days, and what they bought afterwards. */
export async function listCodesWithResults(db: D1Database): Promise<CodeReport[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLS.split(", ").map((c) => `ac.${c}`).join(", ")}, af.code AS affiliate_code,
        (SELECT COUNT(*) FROM access_code_claims cl WHERE cl.code_id = ac.id) AS requested,
        (SELECT COUNT(DISTINCT cl.email) FROM access_code_claims cl WHERE cl.code_id = ac.id AND cl.claimed_at IS NOT NULL) AS members,
        (SELECT COUNT(DISTINCT u.id) FROM access_code_claims cl JOIN users u ON u.email = cl.email JOIN lesson_progress lp ON lp.user_id = u.id
           WHERE cl.code_id = ac.id AND cl.claimed_at IS NOT NULL AND lp.completed_at > datetime('now', '-30 days')) AS active30,
        (SELECT COUNT(*) FROM orders o WHERE o.status = 'paid' AND o.total_pence > 0 AND o.email IN (SELECT cl.email FROM access_code_claims cl WHERE cl.code_id = ac.id AND cl.claimed_at IS NOT NULL)
           AND o.paid_at > (SELECT MIN(cl.claimed_at) FROM access_code_claims cl WHERE cl.code_id = ac.id AND cl.email = o.email)) AS laterSales,
        (SELECT COALESCE(SUM(COALESCE(o.amount_paid_pence, o.total_pence)), 0) FROM orders o WHERE o.status = 'paid' AND o.total_pence > 0 AND o.email IN (SELECT cl.email FROM access_code_claims cl WHERE cl.code_id = ac.id AND cl.claimed_at IS NOT NULL)
           AND o.paid_at > (SELECT MIN(cl.claimed_at) FROM access_code_claims cl WHERE cl.code_id = ac.id AND cl.email = o.email)) AS laterSalesPence
       FROM access_codes ac LEFT JOIN affiliates af ON af.id = ac.affiliate_id ORDER BY ac.status = 'ended', ac.id DESC`,
    )
    .all<CodeReport>();
  return results;
}

/** Pause (no new members), resume, or end a code. Ending also removes the access it gave, e.g. when an organisation stops paying. */
export async function setCodeStatus(db: D1Database, id: number, status: "active" | "paused" | "ended", actor: Actor): Promise<void> {
  const ac = await db.prepare("SELECT code, status FROM access_codes WHERE id = ?1").bind(id).first<{ code: string; status: string }>();
  if (!ac || ac.status === "ended") return;
  await db.prepare("UPDATE access_codes SET status = ?1, ended_at = CASE WHEN ?1 = 'ended' THEN datetime('now') ELSE ended_at END WHERE id = ?2").bind(status, id).run();
  if (status === "ended") {
    await db.prepare("UPDATE entitlements SET revoked_at = datetime('now') WHERE revoked_at IS NULL AND order_id IN (SELECT id FROM orders WHERE access_code = ?1 AND total_pence = 0)").bind(ac.code).run();
  }
  await recordAudit(db, { actorUserId: actor.userId, action: `code.${status}`, targetType: "access_code", targetId: ac.code, ip: actor.ip });
}

/** True if this member's access came from a beta code (their reviews must say they had it free). */
export const BETA_REVIEWER_SQL = `EXISTS (SELECT 1 FROM orders bo JOIN access_codes bc ON bc.code = bo.access_code AND bc.kind = 'beta' JOIN users bu ON bu.email = bo.email WHERE bu.id = r.user_id)`;
