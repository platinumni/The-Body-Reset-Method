import { randomToken } from "../lib/crypto";
import { recordAudit } from "./audit";
import type { Actor } from "./admin-content";
import { createEmailToken } from "./email-tokens";
import type { Order } from "./orders";
import { programmesUnlockedBy } from "./products";

// Admin views of orders and customers, manual access grants, CSV export.

export type OrderListRow = Order & { items: string };

export async function listOrders(db: D1Database, search = "", limit = 100): Promise<OrderListRow[]> {
  const q = `%${search.trim().toLowerCase()}%`;
  const { results } = await db
    .prepare(
      `SELECT o.id, o.public_id, o.email, o.name, o.status, o.total_pence, o.currency, o.stripe_session_id, o.stripe_payment_intent, o.ref_code,
              o.marketing_opt_in, o.created_at, o.paid_at,
              (SELECT GROUP_CONCAT(title, ', ') FROM order_items WHERE order_id = o.id) AS items
       FROM orders o
       WHERE (?1 = '%%' OR LOWER(COALESCE(o.email, '')) LIKE ?1 OR LOWER(o.public_id) LIKE ?1)
         AND (o.status != 'pending' OR o.created_at > datetime('now', '-1 day'))
       ORDER BY o.id DESC LIMIT ?2`,
    )
    .bind(q, limit)
    .all<OrderListRow>();
  return results;
}

export async function getOrderDetail(db: D1Database, publicId: string) {
  const order = await db.prepare("SELECT * FROM orders WHERE public_id = ?1").bind(publicId).first<Order & { consents_json: string; country: string | null; refunded_at: string | null }>();
  if (!order) return null;
  const items = (await db.prepare("SELECT title, price_pence FROM order_items WHERE order_id = ?1").bind(order.id).all<{ title: string; price_pence: number }>()).results;
  const access = (
    await db
      .prepare("SELECT p.title, e.granted_at, e.revoked_at FROM entitlements e JOIN products p ON p.id = e.product_id WHERE e.order_id = ?1")
      .bind(order.id)
      .all<{ title: string; granted_at: string; revoked_at: string | null }>()
  ).results;
  return { order, items, access, consents: JSON.parse(order.consents_json) as Record<string, { given: boolean; version: string }> };
}

/**
 * Give someone a programme for free (a gift, a tester, a fix). Recorded as a £0 order
 * so it's visible and auditable. Returns a setup link if they have no account yet.
 */
export async function grantAccess(db: D1Database, emailRaw: string, productId: number, actor: Actor): Promise<{ orderPublicId: string; setupToken: string | null } | null> {
  const email = emailRaw.trim().toLowerCase();
  const product = await db.prepare("SELECT id, title, kind FROM products WHERE id = ?1").bind(productId).first<{ id: number; title: string; kind: "programme" | "bundle" }>();
  if (!product) return null;
  const publicId = `GIFT-${randomToken(5).toUpperCase()}`;
  const orderId = (await db
    .prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json, paid_at) VALUES (?1, ?2, 'paid', 0, '{\"manual\":true}', datetime('now')) RETURNING id")
    .bind(publicId, email)
    .first<number>("id"))!;
  const user = await db.prepare("SELECT id, password_hash FROM users WHERE email = ?1 AND deleted_at IS NULL").bind(email).first<{ id: number; password_hash: string | null }>();
  await db.batch([
    db.prepare("INSERT INTO order_items (order_id, product_id, title, price_pence) VALUES (?1, ?2, ?3, 0)").bind(orderId, product.id, product.title),
    ...(await programmesUnlockedBy(db, product)).map((pid) =>
      db.prepare("INSERT INTO entitlements (email, user_id, product_id, order_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING").bind(email, user?.id ?? null, pid, orderId),
    ),
  ]);
  await recordAudit(db, { actorUserId: actor.userId, action: "access.grant", targetType: "order", targetId: publicId, ip: actor.ip, detail: { email, product: product.title } });
  return { orderPublicId: publicId, setupToken: user?.password_hash ? null : await createEmailToken(db, "setup", email, orderId) };
}

export async function revokeOrderAccess(db: D1Database, orderId: number, actor: Actor): Promise<void> {
  await db.prepare("UPDATE entitlements SET revoked_at = datetime('now') WHERE order_id = ?1 AND revoked_at IS NULL").bind(orderId).run();
  await recordAudit(db, { actorUserId: actor.userId, action: "access.revoke", targetType: "order", targetId: orderId, ip: actor.ip });
}

export type CustomerRow = { email: string; name: string | null; has_account: number; programmes: number; spent_pence: number; first_seen: string };

/** Everyone who has bought or has an account (admins excluded). */
export async function listCustomers(db: D1Database, search = "", limit = 500): Promise<CustomerRow[]> {
  const q = `%${search.trim().toLowerCase()}%`;
  const { results } = await db
    .prepare(
      `WITH people AS (
         SELECT email FROM users WHERE deleted_at IS NULL AND role = 'customer'
         UNION SELECT email FROM orders WHERE status IN ('paid', 'refunded') AND email IS NOT NULL
       )
       SELECT p.email,
         (SELECT name FROM users u WHERE u.email = p.email AND u.deleted_at IS NULL) AS name,
         EXISTS (SELECT 1 FROM users u WHERE u.email = p.email AND u.deleted_at IS NULL AND u.password_hash IS NOT NULL) AS has_account,
         (SELECT COUNT(DISTINCT product_id) FROM entitlements e WHERE e.email = p.email AND e.revoked_at IS NULL) AS programmes,
         (SELECT COALESCE(SUM(total_pence), 0) FROM orders o WHERE o.email = p.email AND o.status = 'paid') AS spent_pence,
         COALESCE((SELECT MIN(created_at) FROM orders o WHERE o.email = p.email), (SELECT created_at FROM users u WHERE u.email = p.email)) AS first_seen
       FROM people p
       WHERE p.email NOT IN (SELECT email FROM users WHERE role = 'admin') AND (?1 = '%%' OR LOWER(p.email) LIKE ?1)
       ORDER BY first_seen DESC LIMIT ?2`,
    )
    .bind(q, limit)
    .all<CustomerRow>();
  return results;
}

export async function userIdByEmail(db: D1Database, email: string): Promise<number | null> {
  return db.prepare("SELECT id FROM users WHERE email = ?1 AND deleted_at IS NULL AND role = 'customer'").bind(email.toLowerCase()).first<number>("id");
}

/** CSV with a guard against spreadsheet formula injection. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

// --- Dashboard numbers -------------------------------------------------------

export type DashboardNumbers = {
  sales7: { count: number; pence: number };
  sales30: { count: number; pence: number };
  members: number;
  buyersWithoutAccount: number;
  onSale: number;
  draftLessons: number;
  emailsFailed7: number;
  lastBackup: { created_at: string; status: string } | null;
};

export async function dashboardNumbers(db: D1Database): Promise<DashboardNumbers> {
  const one = <T,>(sql: string) => db.prepare(sql).first<T>();
  const s7 = await one<{ count: number; pence: number }>("SELECT COUNT(*) AS count, COALESCE(SUM(total_pence), 0) AS pence FROM orders WHERE status = 'paid' AND total_pence > 0 AND paid_at > datetime('now', '-7 days')");
  const s30 = await one<{ count: number; pence: number }>("SELECT COUNT(*) AS count, COALESCE(SUM(total_pence), 0) AS pence FROM orders WHERE status = 'paid' AND total_pence > 0 AND paid_at > datetime('now', '-30 days')");
  return {
    sales7: s7 ?? { count: 0, pence: 0 },
    sales30: s30 ?? { count: 0, pence: 0 },
    members: (await one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'customer' AND deleted_at IS NULL AND password_hash IS NOT NULL"))?.n ?? 0,
    buyersWithoutAccount:
      (await one<{ n: number }>("SELECT COUNT(DISTINCT e.email) AS n FROM entitlements e WHERE e.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = e.email AND u.password_hash IS NOT NULL)"))?.n ?? 0,
    onSale: (await one<{ n: number }>("SELECT COUNT(*) AS n FROM products WHERE status = 'on_sale' AND price_pence IS NOT NULL"))?.n ?? 0,
    draftLessons: (await one<{ n: number }>("SELECT COUNT(*) AS n FROM programme_lessons WHERE status = 'draft'"))?.n ?? 0,
    emailsFailed7: (await one<{ n: number }>("SELECT COUNT(*) AS n FROM email_log WHERE status = 'failed' AND created_at > datetime('now', '-7 days')"))?.n ?? 0,
    lastBackup: await one<{ created_at: string; status: string }>("SELECT created_at, status FROM backups ORDER BY id DESC LIMIT 1"),
  };
}
