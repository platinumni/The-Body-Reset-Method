import { randomToken, sha256Hex } from "../lib/crypto";

// Login sessions. The browser holds a random token; the database stores only its
// SHA-256 hash, so a leaked database can't be used to log in as anyone.

export const SESSION_DAYS = 30;

export type SessionUser = { id: number; email: string; name: string | null; role: "customer" | "admin"; mfa?: number };

/** Admin sessions are short: log in again (with the authenticator code) after 12 hours. */
export const ADMIN_SESSION_HOURS = 12;

export async function createSession(
  db: D1Database,
  userId: number,
  meta: { ip?: string; userAgent?: string; hours?: number; mfaVerified?: boolean } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + (meta.hours ?? SESSION_DAYS * 24) * 3_600_000);
  await db
    .prepare("INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent, mfa_verified) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(userId, await sha256Hex(token), expiresAt.toISOString(), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, meta.mfaVerified ? 1 : 0)
    .run();
  return { token, expiresAt };
}

export async function getSessionUser(db: D1Database, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  return db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, s.mfa_verified AS mfa FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2 AND u.deleted_at IS NULL`,
    )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<SessionUser>();
}

export async function revokeSession(db: D1Database, token: string): Promise<void> {
  await db
    .prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?1 AND revoked_at IS NULL")
    .bind(await sha256Hex(token))
    .run();
}

/** Log a user out everywhere (e.g. after a password change). */
export async function revokeAllSessions(db: D1Database, userId: number): Promise<void> {
  await db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ?1 AND revoked_at IS NULL").bind(userId).run();
}
