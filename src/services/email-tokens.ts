import { randomToken, sha256Hex } from "../lib/crypto";

// Single-use emailed links. Only a hash of the token is stored.

export type TokenPurpose = "setup" | "reset";
export const TOKEN_TTL_MS: Record<TokenPurpose, number> = { setup: 7 * 86_400_000, reset: 3_600_000 };

export async function createEmailToken(db: D1Database, purpose: TokenPurpose, email: string, orderId: number | null = null): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO email_tokens (purpose, email, token_hash, order_id, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(purpose, email.toLowerCase(), await sha256Hex(token), orderId, new Date(Date.now() + TOKEN_TTL_MS[purpose]).toISOString())
    .run();
  return token;
}

/** Look up a token without using it (to show the form). */
export async function peekEmailToken(db: D1Database, purpose: TokenPurpose, token: string): Promise<{ email: string } | null> {
  return db
    .prepare("SELECT email FROM email_tokens WHERE purpose = ?1 AND token_hash = ?2 AND used_at IS NULL AND expires_at > ?3")
    .bind(purpose, await sha256Hex(token), new Date().toISOString())
    .first<{ email: string }>();
}

/** Use a token: succeeds once only, even if two requests race. */
export async function consumeEmailToken(db: D1Database, purpose: TokenPurpose, token: string): Promise<{ email: string } | null> {
  return db
    .prepare(
      `UPDATE email_tokens SET used_at = datetime('now')
       WHERE purpose = ?1 AND token_hash = ?2 AND used_at IS NULL AND expires_at > ?3
       RETURNING email`,
    )
    .bind(purpose, await sha256Hex(token), new Date().toISOString())
    .first<{ email: string }>();
}
