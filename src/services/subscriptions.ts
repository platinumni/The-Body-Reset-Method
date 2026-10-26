import { randomToken } from "../lib/crypto";
import type { Order } from "./orders";

// Monthly memberships (Body Regeneration Kitchen). Stripe runs the billing; we keep a copy of
// each membership's state from its webhooks, and record each monthly payment as a paid order.

export type Subscription = {
  id: number;
  email: string;
  product_id: number;
  first_order_id: number;
  stripe_subscription_id: string;
  status: "active" | "past_due" | "ended";
  cancel_at_period_end: number;
  current_period_end: string | null;
  created_at: string;
  ended_at: string | null;
};

const COLS = "id, email, product_id, first_order_id, stripe_subscription_id, status, cancel_at_period_end, current_period_end, created_at, ended_at";
const ORDER_COLS = "id, public_id, email, name, status, total_pence, amount_paid_pence, currency, stripe_session_id, stripe_payment_intent, ref_code, ge_ref, access_code, marketing_opt_in, created_at, paid_at";

const fromUnix = (s: unknown) => (typeof s === "number" && s > 0 ? new Date(s * 1000).toISOString().replace("T", " ").slice(0, 19) : null);

/** Stripe's subscription id from an invoice (older and newer API shapes). */
export function invoiceSubscriptionId(inv: Record<string, any>): string | null {
  return inv.subscription ?? inv.parent?.subscription_details?.subscription ?? inv.lines?.data?.[0]?.subscription ?? null;
}

/** The end of the period paid for (older and newer API shapes). */
const periodEnd = (sub: Record<string, any>) => fromUnix(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end);

/** Called when the first payment succeeds. */
export async function recordNewSubscription(db: D1Database, order: Order, session: Record<string, any>): Promise<void> {
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subId || !order.email) return;
  const productId = await db.prepare("SELECT product_id FROM order_items WHERE order_id = ?1 LIMIT 1").bind(order.id).first<number>("product_id");
  await db
    .prepare(
      `INSERT INTO subscriptions (email, product_id, first_order_id, stripe_subscription_id, stripe_customer_id) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (stripe_subscription_id) DO NOTHING`,
    )
    .bind(order.email, productId, order.id, subId, typeof session.customer === "string" ? session.customer : null)
    .run();
  const sid = await db.prepare("SELECT id FROM subscriptions WHERE stripe_subscription_id = ?1").bind(subId).first<number>("id");
  await db.prepare("UPDATE orders SET subscription_id = ?1 WHERE id = ?2").bind(sid, order.id).run();
}

export async function subscriptionByStripeId(db: D1Database, stripeId: string): Promise<Subscription | null> {
  return db.prepare(`SELECT ${COLS} FROM subscriptions WHERE stripe_subscription_id = ?1`).bind(stripeId).first<Subscription>();
}

/** A monthly renewal was paid: record it as its own paid order (once per invoice). Returns the new order, or null if already recorded. */
export async function recordRenewal(db: D1Database, invoice: Record<string, any>): Promise<Order | null> {
  const subId = invoiceSubscriptionId(invoice);
  if (!subId || invoice.billing_reason !== "subscription_cycle") return null;
  const sub = await subscriptionByStripeId(db, subId);
  if (!sub) return null;
  if (await db.prepare("SELECT 1 FROM orders WHERE stripe_session_id = ?1").bind(String(invoice.id)).first()) return null;
  // No share code on renewals: the partner who brought them earns for 12 months via referred_customers.
  const first = await db.prepare("SELECT ref_code, ge_ref, access_code, currency FROM orders WHERE id = ?1").bind(sub.first_order_id).first<{ ref_code: string | null; ge_ref: string | null; access_code: string | null; currency: string }>();
  const paid = Number(invoice.amount_paid ?? 0);
  if (!(paid > 0)) return null;
  const pi = typeof invoice.payment_intent === "string" ? invoice.payment_intent : (invoice.payments?.data?.[0]?.payment?.payment_intent ?? null);
  const order = await db
    .prepare(
      `INSERT INTO orders (public_id, email, status, total_pence, amount_paid_pence, currency, stripe_session_id, stripe_payment_intent, ref_code, ge_ref, access_code, consents_json, paid_at, subscription_id)
       VALUES (?1, ?2, 'paid', ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '{"renewal":true}', datetime('now'), ?10) RETURNING ${ORDER_COLS}`,
    )
    .bind(`BRM-${randomToken(6).toUpperCase()}`, sub.email, paid, (invoice.currency ?? first?.currency ?? "gbp").toLowerCase(), String(invoice.id), pi, null, first?.ge_ref ?? null, first?.access_code ?? null, sub.id)
    .first<Order>();
  const title = await db.prepare("SELECT title FROM products WHERE id = ?1").bind(sub.product_id).first<string>("title");
  await db.prepare("INSERT INTO order_items (order_id, product_id, title, price_pence) VALUES (?1, ?2, ?3, ?4)").bind(order!.id, sub.product_id, `${title ?? "Membership"} (monthly)`, paid).run();
  return order;
}

/** Stripe changed the membership (cancelled, payment failed, renewed...). Ending it removes access. */
export async function applySubscriptionUpdate(db: D1Database, sub: Record<string, any>): Promise<"ended" | "updated" | "unknown"> {
  const row = await subscriptionByStripeId(db, String(sub.id));
  if (!row) return "unknown";
  const ended = ["canceled", "unpaid", "incomplete_expired"].includes(sub.status);
  const status = ended ? "ended" : sub.status === "past_due" ? "past_due" : "active";
  await db
    .prepare("UPDATE subscriptions SET status = ?1, cancel_at_period_end = ?2, current_period_end = COALESCE(?3, current_period_end), ended_at = CASE WHEN ?1 = 'ended' THEN COALESCE(ended_at, datetime('now')) ELSE NULL END WHERE id = ?4")
    .bind(status, sub.cancel_at_period_end ? 1 : 0, periodEnd(sub), row.id)
    .run();
  if (ended) await endAccess(db, row);
  return ended ? "ended" : "updated";
}

async function endAccess(db: D1Database, row: Subscription) {
  await db.prepare("UPDATE entitlements SET revoked_at = datetime('now') WHERE order_id = ?1 AND revoked_at IS NULL").bind(row.first_order_id).run();
}

/** The member's current membership for a product, if any (newest first). */
export async function memberSubscription(db: D1Database, email: string, productId: number): Promise<Subscription | null> {
  return db.prepare(`SELECT ${COLS} FROM subscriptions WHERE email = ?1 AND product_id = ?2 AND status != 'ended' ORDER BY id DESC LIMIT 1`).bind(email, productId).first<Subscription>();
}

/** Has this email got a live membership for the product? (Stops paying twice.) */
export const hasLiveMembership = async (db: D1Database, email: string, productId: number) => !!(await memberSubscription(db, email, productId));

export async function markCancelRequested(db: D1Database, id: number, cancel: boolean): Promise<void> {
  await db.prepare("UPDATE subscriptions SET cancel_at_period_end = ?1 WHERE id = ?2").bind(cancel ? 1 : 0, id).run();
}

/** The membership started by this order (to end it if the first payment is refunded). */
export async function subscriptionForFirstOrder(db: D1Database, orderId: number): Promise<Subscription | null> {
  return db.prepare(`SELECT ${COLS} FROM subscriptions WHERE first_order_id = ?1`).bind(orderId).first<Subscription>();
}

export async function membershipCounts(db: D1Database): Promise<{ active: number; cancelling: number; ended: number }> {
  const row = await db
    .prepare("SELECT SUM(status != 'ended' AND cancel_at_period_end = 0) AS active, SUM(status != 'ended' AND cancel_at_period_end = 1) AS cancelling, SUM(status = 'ended') AS ended FROM subscriptions")
    .first<{ active: number | null; cancelling: number | null; ended: number | null }>();
  return { active: row?.active ?? 0, cancelling: row?.cancelling ?? 0, ended: row?.ended ?? 0 };
}

/** The Kitchen product's id and monthly price (for the membership page). */
export async function kitchenProduct(db: D1Database): Promise<{ id: number; monthly_pence: number | null; currency: string } | null> {
  return db.prepare("SELECT id, monthly_pence, currency FROM products WHERE slug = 'meal-plans'").first<{ id: number; monthly_pence: number | null; currency: string }>();
}

/** A member's current Kitchen membership, if any. */
export async function kitchenMembership(db: D1Database, email: string): Promise<Subscription | null> {
  const p = await kitchenProduct(db);
  return p ? memberSubscription(db, email, p.id) : null;
}
