import { decryptText, encryptText } from "../lib/encryption";
import { randomToken, sha256Hex } from "../lib/crypto";
import { verifyTotp } from "../lib/totp";

// Admin two-step login: password first, then a 6-digit authenticator code (or a backup code).

const CHALLENGE_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export async function hasMfa(db: D1Database, userId: number): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 FROM admin_mfa WHERE user_id = ?1").bind(userId).first());
}

/** After a correct password: a short-lived ticket for the second step. */
export async function createChallenge(db: D1Database, userId: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO login_challenges (user_id, token_hash, expires_at) VALUES (?1, ?2, ?3)")
    .bind(userId, await sha256Hex(token), new Date(Date.now() + CHALLENGE_MINUTES * 60_000).toISOString())
    .run();
  return token;
}

/** Find a live challenge and count this attempt (max 5 tries per challenge). */
export async function useChallengeAttempt(db: D1Database, token: string | undefined): Promise<{ id: number; userId: number } | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `UPDATE login_challenges SET attempts = attempts + 1
       WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 AND attempts < ?3
       RETURNING id, user_id`,
    )
    .bind(await sha256Hex(token), new Date().toISOString(), MAX_ATTEMPTS)
    .first<{ id: number; user_id: number }>();
  return row ? { id: row.id, userId: row.user_id } : null;
}

export async function peekChallenge(db: D1Database, token: string | undefined): Promise<{ userId: number } | null> {
  if (!token) return null;
  const row = await db
    .prepare("SELECT user_id FROM login_challenges WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 AND attempts < ?3")
    .bind(await sha256Hex(token), new Date().toISOString(), MAX_ATTEMPTS)
    .first<{ user_id: number }>();
  return row ? { userId: row.user_id } : null;
}

export async function finishChallenge(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE login_challenges SET used_at = datetime('now') WHERE id = ?1").bind(id).run();
}

/** Check an authenticator code; each code works once only. */
export async function checkTotpCode(db: D1Database, encKey: string, userId: number, code: string): Promise<boolean> {
  const row = await db.prepare("SELECT secret_encrypted, last_used_step FROM admin_mfa WHERE user_id = ?1").bind(userId).first<{ secret_encrypted: string; last_used_step: number }>();
  if (!row) return false;
  const step = await verifyTotp(await decryptText(encKey, row.secret_encrypted), code);
  if (step == null || step <= row.last_used_step) return false;
  const updated = await db.prepare("UPDATE admin_mfa SET last_used_step = ?1 WHERE user_id = ?2 AND last_used_step < ?1").bind(step, userId).run();
  return updated.meta.changes === 1;
}

export async function checkBackupCode(db: D1Database, userId: number, code: string): Promise<boolean> {
  const clean = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.length !== 10) return false;
  const used = await db
    .prepare("UPDATE admin_backup_codes SET used_at = datetime('now') WHERE user_id = ?1 AND code_hash = ?2 AND used_at IS NULL")
    .bind(userId, await sha256Hex(clean))
    .run();
  return used.meta.changes === 1;
}

export async function remainingBackupCodes(db: D1Database, userId: number): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM admin_backup_codes WHERE user_id = ?1 AND used_at IS NULL").bind(userId).first<number>("n")) ?? 0;
}

/** Turn on two-step login once the admin proves their app shows the right code. Returns 10 backup codes (shown once). */
export async function enableMfa(db: D1Database, encKey: string, userId: number, secret: string, code: string): Promise<string[] | null> {
  const step = await verifyTotp(secret, code);
  if (step == null) return null;
  const codes = Array.from({ length: 10 }, () => randomToken(5)); // 10 hex chars each
  await db.batch([
    db
      .prepare(
        `INSERT INTO admin_mfa (user_id, secret_encrypted, last_used_step) VALUES (?1, ?2, ?3)
         ON CONFLICT (user_id) DO UPDATE SET secret_encrypted = excluded.secret_encrypted, last_used_step = excluded.last_used_step, enabled_at = datetime('now')`,
      )
      .bind(userId, await encryptText(encKey, secret), step),
    db.prepare("UPDATE admin_backup_codes SET used_at = datetime('now') WHERE user_id = ?1 AND used_at IS NULL").bind(userId),
    ...(await Promise.all(codes.map(async (c) => db.prepare("INSERT INTO admin_backup_codes (user_id, code_hash) VALUES (?1, ?2)").bind(userId, await sha256Hex(c))))),
  ]);
  return codes.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`);
}

