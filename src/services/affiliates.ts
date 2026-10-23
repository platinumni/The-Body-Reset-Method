import { recordAudit } from "./audit";
import type { Actor } from "./admin-content";
import { loadSettings } from "./site-content";

// Affiliate programme: customers share a link and earn commission on sales it brings.
// One level only. Settings (rate, hold period, minimum payout) are set by the owner in admin.

export const AFFILIATE_TERMS_VERSION = "2026-10-23";
export const REF_COOKIE = "brm_ref";
export const REF_COOKIE_DAYS = 30;

export type AffiliateSettings = { ratePercent: number | null; holdDays: number; minPayoutPence: number };

/** Rate is null until the owner sets it; the programme stays closed until then. */
export async function affiliateSettings(db: D1Database): Promise<AffiliateSettings> {
  const s = await loadSettings(db);
  const rate = Number(s.get("affiliate.rate_percent"));
  return {
    ratePercent: Number.isFinite(rate) && rate > 0 && rate <= 90 ? rate : null,
    holdDays: Math.max(0, Math.min(365, Math.trunc(Number(s.get("affiliate.hold_days") ?? 30)) || 0)),
    minPayoutPence: Math.max(0, Math.trunc(Number(s.get("affiliate.min_payout_pence") ?? 1000)) || 0),
  };
}

export async function saveAffiliateSettings(db: D1Database, input: { rate: string; holdDays: string; minPayout: string }, actor: Actor): Promise<string | null> {
  const rate = input.rate.trim() === "" ? "" : Number(input.rate.replace("%", ""));
  if (rate !== "" && (!Number.isFinite(rate) || rate <= 0 || rate > 90)) return "Commission must be between 1 and 90 per cent, or empty to keep the programme closed.";
  const hold = Number(input.holdDays);
  if (!Number.isInteger(hold) || hold < 0 || hold > 365) return "Hold period must be a whole number of days (0–365).";
  const min = Number(input.minPayout.replace(/[£\s]/g, ""));
  if (!Number.isFinite(min) || min < 0 || min > 1000) return "Minimum payout must be between £0 and £1,000.";
  const values: [string, string][] = [
    ["affiliate.rate_percent", rate === "" ? "" : String(rate)],
    ["affiliate.hold_days", String(hold)],
    ["affiliate.min_payout_pence", String(Math.round(min * 100))],
  ];
  await db.batch(
    values.map(([k, v]) =>
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(k, v),
    ),
  );
  await recordAudit(db, { actorUserId: actor.userId, action: "affiliate.settings", ip: actor.ip, detail: Object.fromEntries(values) });
  return null;
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alike characters
export const CODE_PATTERN = /^[a-z0-9]{6,12}$/;

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export type Affiliate = { id: number; user_id: number; code: string; status: "active" | "suspended"; payout_email: string | null; created_at: string };

export async function getAffiliateByUser(db: D1Database, userId: number): Promise<Affiliate | null> {
  return db.prepare("SELECT id, user_id, code, status, payout_email, created_at FROM affiliates WHERE user_id = ?1").bind(userId).first<Affiliate>();
}

export async function activeAffiliateByCode(db: D1Database, code: string): Promise<(Affiliate & { email: string }) | null> {
  if (!CODE_PATTERN.test(code)) return null;
  return db
    .prepare("SELECT a.id, a.user_id, a.code, a.status, a.payout_email, a.created_at, u.email FROM affiliates a JOIN users u ON u.id = a.user_id WHERE a.code = ?1 AND a.status = 'active' AND u.deleted_at IS NULL")
    .bind(code.toLowerCase())
    .first<Affiliate & { email: string }>();
}

/** Join the programme (only customers who own at least one programme). Records agreement to the terms. */
export async function joinAffiliateProgramme(db: D1Database, user: { id: number; email: string }): Promise<Affiliate | null> {
  const existing = await getAffiliateByUser(db, user.id);
  if (existing) return existing;
  const owns = await db.prepare("SELECT 1 FROM entitlements WHERE user_id = ?1 AND revoked_at IS NULL LIMIT 1").bind(user.id).first();
  if (!owns) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const row = await db
      .prepare("INSERT INTO affiliates (user_id, code, terms_version) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING RETURNING id, user_id, code, status, payout_email, created_at")
      .bind(user.id, code, AFFILIATE_TERMS_VERSION)
      .first<Affiliate>();
    if (row) {
      await db
        .prepare("INSERT INTO consents (user_id, email, kind, granted, wording_version, source) VALUES (?1, ?2, 'affiliate_terms', 1, ?3, 'account-affiliate')")
        .bind(user.id, user.email, AFFILIATE_TERMS_VERSION)
        .run();
      return row;
    }
  }
  return getAffiliateByUser(db, user.id);
}

export async function setPayoutEmail(db: D1Database, userId: number, email: string): Promise<void> {
  await db.prepare("UPDATE affiliates SET payout_email = ?1, updated_at = datetime('now') WHERE user_id = ?2").bind(email || null, userId).run();
}

export async function recordAffiliateClick(db: D1Database, affiliateId: number, now = new Date()): Promise<void> {
  await db
    .prepare("INSERT INTO affiliate_clicks (affiliate_id, day, count) VALUES (?1, ?2, 1) ON CONFLICT (affiliate_id, day) DO UPDATE SET count = count + 1")
    .bind(affiliateId, now.toISOString().slice(0, 10))
    .run();
}

/**
 * Called when an order is paid. Creates commission if the order carried a valid
 * referral code, the programme is open, and the buyer isn't the affiliate themselves.
 */
export async function createCommissionForOrder(db: D1Database, order: { id: number; ref_code: string | null; total_pence: number }, buyerEmail: string): Promise<boolean> {
  if (!order.ref_code || order.total_pence <= 0) return false;
  const affiliate = await activeAffiliateByCode(db, order.ref_code);
  if (!affiliate || affiliate.email.toLowerCase() === buyerEmail.toLowerCase()) return false; // no self-referral
  const settings = await affiliateSettings(db);
  if (settings.ratePercent == null) return false;
  const amount = Math.floor((order.total_pence * settings.ratePercent) / 100);
  if (amount <= 0) return false;
  const availableAt = new Date(Date.now() + settings.holdDays * 86_400_000).toISOString();
  const res = await db
    .prepare("INSERT INTO commissions (affiliate_id, order_id, rate_percent, amount_pence, available_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (order_id) DO NOTHING")
    .bind(affiliate.id, order.id, settings.ratePercent, amount, availableAt)
    .run();
  return res.meta.changes === 1;
}

/** Refunded order: cancel its commission if not yet paid out. (Paid-out commission is flagged for the owner.) */
export async function cancelCommissionForOrder(db: D1Database, orderId: number): Promise<"cancelled" | "already-paid" | "none"> {
  const row = await db.prepare("SELECT id, status FROM commissions WHERE order_id = ?1").bind(orderId).first<{ id: number; status: string }>();
  if (!row) return "none";
  if (row.status === "paid") return "already-paid";
  await db.prepare("UPDATE commissions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?1 AND status IN ('pending', 'approved')").bind(row.id).run();
  return "cancelled";
}

/** Daily job: commission whose hold period has passed becomes owed. */
export async function releaseHeldCommissions(db: D1Database, now = new Date()): Promise<number> {
  const res = await db
    .prepare(
      `UPDATE commissions SET status = 'approved', updated_at = datetime('now')
       WHERE status = 'pending' AND available_at <= ?1
         AND EXISTS (SELECT 1 FROM orders o WHERE o.id = commissions.order_id AND o.status = 'paid')`,
    )
    .bind(now.toISOString())
    .run();
  return res.meta.changes;
}

export type AffiliateSummary = { clicks: number; sales: number; pending: number; approved: number; paid: number };

export async function affiliateSummary(db: D1Database, affiliateId: number): Promise<AffiliateSummary> {
  const clicks = (await db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM affiliate_clicks WHERE affiliate_id = ?1").bind(affiliateId).first<number>("n")) ?? 0;
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n, COALESCE(SUM(amount_pence), 0) AS pence FROM commissions WHERE affiliate_id = ?1 GROUP BY status")
    .bind(affiliateId)
    .all<{ status: string; n: number; pence: number }>();
  const by = (s: string) => results.find((r) => r.status === s);
  return {
    clicks,
    sales: results.filter((r) => r.status !== "cancelled").reduce((t, r) => t + r.n, 0),
    pending: by("pending")?.pence ?? 0,
    approved: by("approved")?.pence ?? 0,
    paid: by("paid")?.pence ?? 0,
  };
}

export type AffiliateAdminRow = Affiliate & { email: string; summary: AffiliateSummary };

export async function listAffiliatesAdmin(db: D1Database): Promise<AffiliateAdminRow[]> {
  const { results } = await db
    .prepare("SELECT a.id, a.user_id, a.code, a.status, a.payout_email, a.created_at, u.email FROM affiliates a JOIN users u ON u.id = a.user_id ORDER BY a.id DESC")
    .all<Affiliate & { email: string }>();
  return Promise.all(results.map(async (a) => ({ ...a, summary: await affiliateSummary(db, a.id) })));
}

export async function setAffiliateStatus(db: D1Database, affiliateId: number, status: "active" | "suspended", actor: Actor): Promise<void> {
  await db.prepare("UPDATE affiliates SET status = ?1, updated_at = datetime('now') WHERE id = ?2").bind(status, affiliateId).run();
  await recordAudit(db, { actorUserId: actor.userId, action: `affiliate.${status === "active" ? "reinstate" : "suspend"}`, targetType: "affiliate", targetId: affiliateId, ip: actor.ip });
}

/**
 * Record that the owner has paid an affiliate everything currently owed.
 * Returns the amount, or null if nothing (or less than the minimum) was owed.
 */
export async function recordPayout(db: D1Database, affiliateId: number, input: { method: string; reference: string }, actor: Actor): Promise<number | null> {
  const owed = (await db.prepare("SELECT COALESCE(SUM(amount_pence), 0) AS p FROM commissions WHERE affiliate_id = ?1 AND status = 'approved'").bind(affiliateId).first<number>("p")) ?? 0;
  const { minPayoutPence } = await affiliateSettings(db);
  if (owed <= 0 || owed < minPayoutPence) return null;
  const payoutId = (await db
    .prepare("INSERT INTO payouts (affiliate_id, amount_pence, method, reference, actor_user_id) VALUES (?1, 0, ?2, ?3, ?4) RETURNING id")
    .bind(affiliateId, input.method.slice(0, 40), input.reference.slice(0, 200) || null, actor.userId)
    .first<number>("id"))!;
  // Mark exactly the commissions included, then record the payout as their total.
  const { results } = await db
    .prepare("UPDATE commissions SET status = 'paid', payout_id = ?1, updated_at = datetime('now') WHERE affiliate_id = ?2 AND status = 'approved' RETURNING amount_pence")
    .bind(payoutId, affiliateId)
    .all<{ amount_pence: number }>();
  const total = results.reduce((t, r) => t + r.amount_pence, 0);
  await db.prepare("UPDATE payouts SET amount_pence = ?1 WHERE id = ?2").bind(total, payoutId).run();
  await recordAudit(db, { actorUserId: actor.userId, action: "affiliate.payout", targetType: "affiliate", targetId: affiliateId, ip: actor.ip, detail: { pence: total, method: input.method } });
  return total;
}
