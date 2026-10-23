import { CHECKOUT_CONSENTS, CONSENT_KINDS, type ConsentKind } from "../content/consents";
import { randomToken } from "../lib/crypto";
import { createEmailToken } from "./email-tokens";
import { programmesUnlockedBy, type Product } from "./products";

// Orders: created as "pending" before payment, marked "paid" only by a verified
// Stripe webhook, and "refunded" (access removed) when Stripe reports a full refund.

export type Order = {
  id: number;
  public_id: string;
  email: string | null;
  name: string | null;
  status: "pending" | "paid" | "refunded" | "expired";
  total_pence: number;
  currency: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  ref_code: string | null;
  marketing_opt_in: number;
  created_at: string;
  paid_at: string | null;
};

const ORDER_COLUMNS = "id, public_id, email, name, status, total_pence, currency, stripe_session_id, stripe_payment_intent, ref_code, marketing_opt_in, created_at, paid_at";

export type ConsentAnswers = Record<ConsentKind, boolean>;

export async function createPendingOrder(
  db: D1Database,
  input: { items: Product[]; consents: ConsentAnswers; refCode?: string | null; ip?: string },
): Promise<Order> {
  const publicId = `BRM-${randomToken(6).toUpperCase()}`;
  const total = input.items.reduce((s, i) => s + (i.price_pence ?? 0), 0);
  const snapshot = Object.fromEntries(CONSENT_KINDS.map((k) => [k, { given: input.consents[k], version: CHECKOUT_CONSENTS[k].version, label: CHECKOUT_CONSENTS[k].label }]));
  const order = await db
    .prepare(
      `INSERT INTO orders (public_id, total_pence, currency, ref_code, consents_json, marketing_opt_in, ip)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING ${ORDER_COLUMNS}`,
    )
    .bind(publicId, total, input.items[0]?.currency ?? "gbp", input.refCode ?? null, JSON.stringify(snapshot), input.consents.marketing_email ? 1 : 0, input.ip ?? null)
    .first<Order>();
  await db.batch(
    input.items.map((i) => db.prepare("INSERT INTO order_items (order_id, product_id, title, price_pence) VALUES (?1, ?2, ?3, ?4)").bind(order!.id, i.id, i.title, i.price_pence)),
  );
  return order!;
}

export async function attachCheckoutSession(db: D1Database, orderId: number, sessionId: string): Promise<void> {
  await db.prepare("UPDATE orders SET stripe_session_id = ?1 WHERE id = ?2").bind(sessionId, orderId).run();
}

export async function getOrderByPublicId(db: D1Database, publicId: string): Promise<Order | null> {
  return db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE public_id = ?1`).bind(publicId).first<Order>();
}

export async function getOrderLines(db: D1Database, orderId: number): Promise<{ product_id: number; title: string; price_pence: number }[]> {
  const { results } = await db.prepare("SELECT product_id, title, price_pence FROM order_items WHERE order_id = ?1 ORDER BY id").bind(orderId).all<{ product_id: number; title: string; price_pence: number }>();
  return results;
}

export type PaidSession = {
  id: string;
  client_reference_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  customer_details?: { email?: string | null; name?: string | null; address?: { country?: string | null } | null } | null;
};

export type MarkPaidResult =
  | { outcome: "paid"; order: Order; email: string; setupToken: string | null }
  | { outcome: "already-processed" | "not-found" | "mismatch" | "no-email" };

/**
 * Record a successful payment: mark the order paid, grant access to each programme,
 * save the checkout consents, and create an account-setup link if needed.
 * Safe to call twice for the same session (the second call changes nothing).
 */
export async function markOrderPaid(db: D1Database, session: PaidSession): Promise<MarkPaidResult> {
  const order = await db
    .prepare(`SELECT ${ORDER_COLUMNS}, consents_json FROM orders WHERE stripe_session_id = ?1 OR public_id = ?2 LIMIT 1`)
    .bind(session.id, session.client_reference_id ?? "")
    .first<Order & { consents_json: string }>();
  if (!order) return { outcome: "not-found" };
  if (order.status !== "pending") return { outcome: "already-processed" };
  // Never grant access if Stripe charged a different amount from the order we created.
  if (session.amount_total !== order.total_pence || (session.currency ?? "").toLowerCase() !== order.currency) {
    console.error("Payment amount mismatch", { order: order.public_id, expected: order.total_pence, got: session.amount_total });
    return { outcome: "mismatch" };
  }
  const email = session.customer_details?.email?.toLowerCase().trim();
  if (!email) return { outcome: "no-email" };

  const lines = await getOrderLines(db, order.id);
  const programmeIds = new Set<number>();
  for (const line of lines) {
    const kind = await db.prepare("SELECT kind FROM products WHERE id = ?1").bind(line.product_id).first<"programme" | "bundle">("kind");
    for (const id of await programmesUnlockedBy(db, { id: line.product_id, kind: kind ?? "programme" })) programmeIds.add(id);
  }
  const user = await db.prepare("SELECT id, password_hash FROM users WHERE email = ?1 AND deleted_at IS NULL").bind(email).first<{ id: number; password_hash: string | null }>();
  const consents = JSON.parse(order.consents_json) as Record<ConsentKind, { given: boolean; version: string }>;

  const updated = await db.batch([
    db
      .prepare(
        `UPDATE orders SET status = 'paid', email = ?1, name = ?2, country = ?3, stripe_payment_intent = ?4, stripe_session_id = ?5, paid_at = datetime('now')
         WHERE id = ?6 AND status = 'pending'`,
      )
      .bind(email, session.customer_details?.name ?? null, session.customer_details?.address?.country ?? null, session.payment_intent ?? null, session.id, order.id),
    ...[...programmeIds].map((pid) =>
      db
        .prepare("INSERT INTO entitlements (email, user_id, product_id, order_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (order_id, product_id) DO NOTHING")
        .bind(email, user?.id ?? null, pid, order.id),
    ),
    ...CONSENT_KINDS.map((k) =>
      db
        .prepare(
          `INSERT INTO consents (user_id, email, kind, granted, wording_version, source)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE NOT EXISTS (SELECT 1 FROM consents WHERE source = ?6 AND kind = ?3)`,
        )
        .bind(user?.id ?? null, email, k, consents[k]?.given ? 1 : 0, consents[k]?.version ?? "unknown", `checkout:${order.public_id}`),
    ),
  ]);
  if (!updated[0]?.meta.changes) return { outcome: "already-processed" };

  const setupToken = user?.password_hash ? null : await createEmailToken(db, "setup", email, order.id);
  return { outcome: "paid", order: { ...order, status: "paid", email }, email, setupToken };
}

/** Full refund: mark the order refunded and remove the access it granted (kept for history, never deleted). */
export async function markOrderRefunded(db: D1Database, paymentIntent: string): Promise<Order | null> {
  const order = await db
    .prepare(`UPDATE orders SET status = 'refunded', refunded_at = datetime('now') WHERE stripe_payment_intent = ?1 AND status = 'paid' RETURNING ${ORDER_COLUMNS}`)
    .bind(paymentIntent)
    .first<Order>();
  if (order) await db.prepare("UPDATE entitlements SET revoked_at = datetime('now') WHERE order_id = ?1 AND revoked_at IS NULL").bind(order.id).run();
  return order;
}

export async function markOrderExpired(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare("UPDATE orders SET status = 'expired' WHERE stripe_session_id = ?1 AND status = 'pending'").bind(sessionId).run();
}

/** Remember a webhook event; returns false if it was already handled. */
export async function isNewStripeEvent(db: D1Database, id: string): Promise<boolean> {
  return !(await db.prepare("SELECT 1 FROM stripe_events WHERE id = ?1").bind(id).first());
}

export async function recordStripeEvent(db: D1Database, id: string, type: string): Promise<void> {
  await db.prepare("INSERT INTO stripe_events (id, type) VALUES (?1, ?2) ON CONFLICT (id) DO NOTHING").bind(id, type).run();
}
