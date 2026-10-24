import { CHECKOUT_CONSENTS } from "../content/consents";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { recordAudit } from "./audit";
import { consumeEmailToken } from "./email-tokens";
import { revokeAllSessions, type SessionUser } from "./sessions";

// Member accounts: creating them from the emailed link, logging in, passwords,
// marketing preference, data export and deletion (UK GDPR).

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/** Returns an error message, or null if the password is acceptable. */
export function passwordProblem(password: string, confirm: string, email: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return "That password is too long.";
  if (password !== confirm) return "The two passwords don't match.";
  if (password.toLowerCase() === email.toLowerCase()) return "Don't use your email address as your password.";
  return null;
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();
export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

/**
 * Finish account setup from the emailed link: create the account (or add a password
 * to one without), mark the email verified, and attach every programme bought with it.
 */
export async function completeSetup(db: D1Database, token: string, input: { name: string; password: string }): Promise<SessionUser | null> {
  const used = await consumeEmailToken(db, "setup", token);
  if (!used) return null;
  const email = normaliseEmail(used.email);
  const hash = await hashPassword(input.password);
  const name = input.name.trim().slice(0, 100) || null;
  const user = await db
    .prepare(
      `INSERT INTO users (email, name, password_hash, email_verified_at) VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT (email) DO UPDATE SET
         name = COALESCE(excluded.name, users.name),
         password_hash = COALESCE(users.password_hash, excluded.password_hash),
         email_verified_at = COALESCE(users.email_verified_at, excluded.email_verified_at),
         updated_at = datetime('now')
       WHERE users.deleted_at IS NULL
       RETURNING id, email, name, role`,
    )
    .bind(email, name, hash)
    .first<SessionUser>();
  if (!user) return null;
  await linkEntitlements(db, user.id, email);
  return user;
}

export async function linkEntitlements(db: D1Database, userId: number, email: string): Promise<void> {
  await db.prepare("UPDATE entitlements SET user_id = ?1 WHERE email = ?2 AND user_id IS NULL").bind(userId, email).run();
  await db.prepare("UPDATE consents SET user_id = ?1 WHERE email = ?2 AND user_id IS NULL").bind(userId, email).run();
}

// Used when no account matches, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

export async function checkLogin(db: D1Database, emailRaw: string, password: string): Promise<SessionUser | null> {
  const email = normaliseEmail(emailRaw);
  const row = await db
    .prepare("SELECT id, email, name, role, password_hash FROM users WHERE email = ?1 AND deleted_at IS NULL")
    .bind(email)
    .first<SessionUser & { password_hash: string | null }>();
  if (!row?.password_hash) {
    dummyHash ??= hashPassword("timing-equaliser");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  if (!(await verifyPassword(password, row.password_hash))) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** What a forgotten-password request should do for this email (never revealed to the visitor). */
export async function recoveryKind(db: D1Database, emailRaw: string): Promise<"reset" | "setup" | null> {
  const email = normaliseEmail(emailRaw);
  const user = await db.prepare("SELECT password_hash FROM users WHERE email = ?1 AND deleted_at IS NULL").bind(email).first<{ password_hash: string | null }>();
  if (user?.password_hash) return "reset";
  // Bought but never set up (or lost the setup email): send a fresh setup link.
  const bought = await db.prepare("SELECT 1 FROM entitlements WHERE email = ?1 AND revoked_at IS NULL LIMIT 1").bind(email).first();
  return bought ? "setup" : null;
}

export async function resetPassword(db: D1Database, token: string, password: string): Promise<SessionUser | null> {
  const used = await consumeEmailToken(db, "reset", token);
  if (!used) return null;
  const user = await db
    .prepare("UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE email = ?2 AND deleted_at IS NULL RETURNING id, email, name, role")
    .bind(await hashPassword(password), normaliseEmail(used.email))
    .first<SessionUser>();
  if (user) await revokeAllSessions(db, user.id); // log out everywhere else
  return user;
}

export async function changePassword(db: D1Database, userId: number, current: string, next: string): Promise<boolean> {
  const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?1 AND deleted_at IS NULL").bind(userId).first<{ password_hash: string | null }>();
  if (!row?.password_hash || !(await verifyPassword(current, row.password_hash))) return false;
  await db.prepare("UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2").bind(await hashPassword(next), userId).run();
  await revokeAllSessions(db, userId);
  return true;
}

export async function verifyUserPassword(db: D1Database, userId: number, password: string): Promise<boolean> {
  const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?1 AND deleted_at IS NULL").bind(userId).first<{ password_hash: string | null }>();
  return !!row?.password_hash && (await verifyPassword(password, row.password_hash));
}

// --- Marketing preference (consent records are append-only; the latest one wins) ---

export async function marketingOptedIn(db: D1Database, email: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT granted FROM consents WHERE email = ?1 AND kind = 'marketing_email' ORDER BY id DESC LIMIT 1")
    .bind(normaliseEmail(email))
    .first<{ granted: number }>();
  return row?.granted === 1;
}

export async function setMarketing(db: D1Database, user: { id: number | null; email: string }, granted: boolean, source: string): Promise<void> {
  await db
    .prepare("INSERT INTO consents (user_id, email, kind, granted, wording_version, source) VALUES (?1, ?2, 'marketing_email', ?3, ?4, ?5)")
    .bind(user.id, normaliseEmail(user.email), granted ? 1 : 0, CHECKOUT_CONSENTS.marketing_email.version, source)
    .run();
}

// --- UK GDPR: download and delete ------------------------------------------------

export async function exportUserData(db: D1Database, userId: number): Promise<Record<string, unknown>> {
  const user = await db.prepare("SELECT id, email, name, role, email_verified_at, created_at, updated_at FROM users WHERE id = ?1").bind(userId).first<{ email: string }>();
  if (!user) return {};
  const q = async (sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all()).results;
  const orders = await q("SELECT id, public_id, status, total_pence, currency, name, country, created_at, paid_at, refunded_at FROM orders WHERE email = ?1", user.email);
  return {
    exportedAt: new Date().toISOString(),
    account: user,
    orders,
    orderItems: await q("SELECT oi.order_id, oi.title, oi.price_pence FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.email = ?1", user.email),
    programmeAccess: await q("SELECT p.title, e.granted_at, e.revoked_at FROM entitlements e JOIN products p ON p.id = e.product_id WHERE e.email = ?1 OR e.user_id = ?2", user.email, userId),
    consents: await q("SELECT kind, granted, wording_version, source, created_at FROM consents WHERE email = ?1 OR user_id = ?2 ORDER BY id", user.email, userId),
    progress: await q("SELECT l.title, lp.completed_at FROM lesson_progress lp JOIN programme_lessons l ON l.id = lp.lesson_id WHERE lp.user_id = ?1", userId),
    emailsSent: await q("SELECT template, subject, status, created_at FROM email_log WHERE to_email = ?1 ORDER BY id", user.email),
    loginSessions: await q("SELECT created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE user_id = ?1 ORDER BY id", userId),
    newsSignup: await q("SELECT status, source, created_at, confirmed_at FROM subscribers WHERE email = ?1", user.email),
    affiliate: await q("SELECT code, status, payout_email, created_at FROM affiliates WHERE user_id = ?1", userId),
    commissions: await q("SELECT c.amount_pence, c.status, c.created_at FROM commissions c JOIN affiliates a ON a.id = c.affiliate_id WHERE a.user_id = ?1 ORDER BY c.id", userId),
    contactMessages: await q("SELECT name, message, created_at FROM contact_messages WHERE email = ?1 ORDER BY id", user.email),
    payouts: await q("SELECT p.amount_pence, p.method, p.created_at FROM payouts p JOIN affiliates a ON a.id = p.affiliate_id WHERE a.user_id = ?1 ORDER BY p.id", userId),
  };
}

/**
 * Erase an account. Personal details are wiped and access ends. Order records stay
 * (UK tax law: 6 years) and consent records stay as proof, as the privacy policy says.
 */
export async function deleteAccount(db: D1Database, userId: number, actor: { userId: number | null; ip?: string }): Promise<void> {
  const user = await db.prepare("SELECT email FROM users WHERE id = ?1 AND deleted_at IS NULL").bind(userId).first<{ email: string }>();
  if (!user) return;
  await db.batch([
    db.prepare("INSERT INTO consents (user_id, email, kind, granted, wording_version, source) VALUES (?1, ?2, 'marketing_email', 0, ?3, 'account-deleted')").bind(userId, user.email, CHECKOUT_CONSENTS.marketing_email.version),
    db.prepare("UPDATE entitlements SET revoked_at = COALESCE(revoked_at, datetime('now')) WHERE user_id = ?1 OR email = ?2").bind(userId, user.email),
    db.prepare("DELETE FROM lesson_progress WHERE user_id = ?1").bind(userId),
    db.prepare("DELETE FROM contact_messages WHERE email = ?1").bind(user.email),
    // Their share link stops working; any commission already owed stays on record for the owner to settle.
    db.prepare("UPDATE affiliates SET status = 'suspended', updated_at = datetime('now') WHERE user_id = ?1").bind(userId),
    db.prepare("UPDATE sessions SET revoked_at = COALESCE(revoked_at, datetime('now')), ip = NULL, user_agent = NULL WHERE user_id = ?1").bind(userId),
    db.prepare("UPDATE email_tokens SET used_at = COALESCE(used_at, datetime('now')) WHERE email = ?1").bind(user.email),
    db
      .prepare("UPDATE users SET email = ?1, name = NULL, password_hash = NULL, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?2")
      .bind(`deleted-${userId}@deleted.invalid`, userId),
  ]);
  await recordAudit(db, { actorUserId: actor.userId, action: "account.delete", targetType: "user", targetId: userId, ip: actor.ip });
}
