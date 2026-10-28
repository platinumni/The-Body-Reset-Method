import { friendRewardEmail } from "../emails/automation";
import { sendEmail } from "./email";
import { applyFriendReward } from "./payments/stripe";
import { kitchenMembership, kitchenProduct } from "./subscriptions";

// Kitchen refer-a-friend (owner, 2026-10-26/28). A Kitchen member shares their code; the friend gets half off the
// joining fee. 14 days after a friend joins (not refunded, still a member) it counts: 1 friend = a year free,
// 2 friends = lifetime free ("for as long as the Kitchen runs", see the terms).

export const FRIEND_HOLD_DAYS = 14;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I/L

export type FriendCode = { code: string; email: string; show_name: number };
export type Reward = "year" | "lifetime";
export type FriendStatus = { code: string; showName: boolean; pending: number; counted: number; reward: Reward | null };

/** Half the joining fee, rounded down to the penny (£19.99 → £9.99). */
export const friendJoinPence = (join: number) => Math.floor(join / 2);

export const rewardFor = (counted: number): Reward | null => (counted >= 2 ? "lifetime" : counted === 1 ? "year" : null);

const cleanCode = (raw: unknown) => String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** A Kitchen member's friend code (made the first time they look). Only live members get one. */
export async function friendCodeFor(db: D1Database, email: string): Promise<FriendCode | null> {
  const existing = await db.prepare("SELECT code, email, show_name FROM kitchen_friend_codes WHERE email = ?1").bind(email).first<FriendCode>();
  if (existing) return existing;
  if (!(await kitchenMembership(db, email))) return null;
  for (let i = 0; i < 5; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    const row = await db.prepare("INSERT INTO kitchen_friend_codes (code, email) VALUES (?1, ?2) ON CONFLICT DO NOTHING RETURNING code, email, show_name").bind(code, email).first<FriendCode>();
    if (row) return row;
    const raced = await db.prepare("SELECT code, email, show_name FROM kitchen_friend_codes WHERE email = ?1").bind(email).first<FriendCode>();
    if (raced) return raced;
  }
  throw new Error("Couldn't make a friend code");
}

export async function setShowName(db: D1Database, email: string, show: boolean): Promise<void> {
  await db.prepare("UPDATE kitchen_friend_codes SET show_name = ?1 WHERE email = ?2").bind(show ? 1 : 0, email).run();
}

/** The member behind a code, if their membership is still live. `inviter` is their first name if they chose to show it. */
export async function openFriendCode(db: D1Database, raw: unknown): Promise<{ code: string; email: string; inviter: string | null } | null> {
  const code = cleanCode(raw);
  if (!code) return null;
  const row = await db
    .prepare("SELECT f.code, f.email, f.show_name, u.name FROM kitchen_friend_codes f LEFT JOIN users u ON u.email = f.email AND u.deleted_at IS NULL WHERE f.code = ?1")
    .bind(code)
    .first<FriendCode & { name: string | null }>();
  if (!row || !(await kitchenMembership(db, row.email))) return null;
  const first = row.show_name && row.name ? row.name.trim().split(/\s+/)[0]!.slice(0, 40) : null;
  return { code: row.code, email: row.email, inviter: first || null };
}

/** Can this email join with a friend's half-price offer? New members only, and not the member themselves. */
export async function friendOfferAllowed(db: D1Database, code: { email: string }, friendEmail: string): Promise<boolean> {
  if (friendEmail.toLowerCase() === code.email.toLowerCase()) return false;
  const product = await kitchenProduct(db);
  if (!product) return false;
  const before = await db
    .prepare("SELECT (SELECT COUNT(*) FROM subscriptions WHERE email = ?1 AND product_id = ?2) + (SELECT COUNT(*) FROM kitchen_referrals WHERE friend_email = ?1) AS n")
    .bind(friendEmail, product.id)
    .first<number>("n");
  return !before;
}

/** The friend's first payment went through: note the referral (it counts after the hold). */
export async function recordFriendJoin(db: D1Database, order: { id: number; email: string | null; friend_code?: string | null }): Promise<void> {
  const row = await db.prepare("SELECT friend_code FROM orders WHERE id = ?1").bind(order.id).first<string | null>("friend_code");
  if (!row || !order.email) return;
  const code = await db.prepare("SELECT code, email FROM kitchen_friend_codes WHERE code = ?1").bind(row).first<FriendCode>();
  if (!code || code.email.toLowerCase() === order.email.toLowerCase()) return;
  await db.prepare("INSERT INTO kitchen_referrals (code, friend_email, order_id) VALUES (?1, ?2, ?3) ON CONFLICT (friend_email) DO NOTHING").bind(code.code, order.email, order.id).run();
}

/** The friend's first payment was refunded before the referral counted: it doesn't count. */
export async function cancelFriendJoin(db: D1Database, orderId: number): Promise<void> {
  await db.prepare("UPDATE kitchen_referrals SET status = 'cancelled' WHERE order_id = ?1 AND status = 'pending'").bind(orderId).run();
}

export async function friendStatus(db: D1Database, email: string): Promise<FriendStatus | null> {
  const code = await friendCodeFor(db, email);
  if (!code) return null;
  const counts = await db
    .prepare("SELECT SUM(status = 'pending') AS pending, SUM(status = 'counted') AS counted FROM kitchen_referrals WHERE code = ?1")
    .bind(code.code)
    .first<{ pending: number | null; counted: number | null }>();
  const reward = await db.prepare("SELECT reward FROM kitchen_friend_rewards WHERE email = ?1").bind(email).first<Reward>("reward");
  return { code: code.code, showName: !!code.show_name, pending: counts?.pending ?? 0, counted: counts?.counted ?? 0, reward: reward ?? null };
}

/**
 * Daily job. Referrals past the hold count if the friend's first payment wasn't refunded and they're still a member;
 * otherwise they're cancelled. Then each member whose reward has gone up gets it on their Stripe membership, and an email.
 */
export async function settleFriendRewards(env: Env, now = new Date()): Promise<string> {
  const db = env.DB;
  const cutoff = new Date(now.getTime() - FRIEND_HOLD_DAYS * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const { results: due } = await db
    .prepare(
      `SELECT r.id, o.status AS order_status, s.status AS sub_status FROM kitchen_referrals r
       JOIN orders o ON o.id = r.order_id LEFT JOIN subscriptions s ON s.first_order_id = r.order_id
       WHERE r.status = 'pending' AND r.created_at <= ?1`,
    )
    .bind(cutoff)
    .all<{ id: number; order_status: string; sub_status: string | null }>();
  for (const r of due) {
    const counts = r.order_status === "paid" && r.sub_status != null && r.sub_status !== "ended";
    await db.prepare(`UPDATE kitchen_referrals SET status = ?1, counted_at = CASE WHEN ?1 = 'counted' THEN datetime('now') END WHERE id = ?2`).bind(counts ? "counted" : "cancelled", r.id).run();
  }

  // Members whose counted friends earn more than they've been given.
  const { results: owed } = await db
    .prepare(
      `SELECT f.email, COUNT(*) AS counted, w.reward AS current FROM kitchen_referrals r JOIN kitchen_friend_codes f ON f.code = r.code
       LEFT JOIN kitchen_friend_rewards w ON w.email = f.email
       WHERE r.status = 'counted' GROUP BY f.email`,
    )
    .all<{ email: string; counted: number; current: Reward | null }>();
  let granted = 0;
  let waiting = 0;
  for (const m of owed) {
    const reward = rewardFor(m.counted);
    if (!reward || m.current === reward || m.current === "lifetime") continue;
    const sub = await kitchenMembership(db, m.email);
    if (!sub || !env.STRIPE_SECRET_KEY) {
      waiting++;
      continue;
    }
    try {
      await applyFriendReward(env.STRIPE_SECRET_KEY, sub.stripe_subscription_id, reward);
    } catch (err) {
      console.error("Friend reward not applied", { reward, err: String(err) });
      waiting++;
      continue;
    }
    await db
      .prepare(
        `INSERT INTO kitchen_friend_rewards (email, reward, stripe_subscription_id) VALUES (?1, ?2, ?3)
         ON CONFLICT (email) DO UPDATE SET reward = excluded.reward, stripe_subscription_id = excluded.stripe_subscription_id, granted_at = datetime('now')`,
      )
      .bind(m.email, reward, sub.stripe_subscription_id)
      .run();
    await sendEmail(env, friendRewardEmail({ siteName: env.SITE_NAME, to: m.email, reward, url: `${env.SITE_URL}/account/membership` }));
    granted++;
  }
  return `${due.length} checked, ${granted} rewards given${waiting ? `, ${waiting} waiting` : ""}`;
}

/** For the member's data export. */
export async function friendDataFor(db: D1Database, email: string): Promise<Record<string, unknown>> {
  const q = async (sql: string) => (await db.prepare(sql).bind(email).all()).results;
  return {
    friendCode: await q("SELECT code, show_name, created_at FROM kitchen_friend_codes WHERE email = ?1"),
    friendsWhoJoined: await q("SELECT r.status, r.created_at, r.counted_at FROM kitchen_referrals r JOIN kitchen_friend_codes f ON f.code = r.code WHERE f.email = ?1"),
    friendReward: await q("SELECT reward, granted_at FROM kitchen_friend_rewards WHERE email = ?1"),
  };
}
