import { CHECKOUT_CONSENTS } from "../content/consents";
import { randomToken, sha256Hex } from "../lib/crypto";
import { normaliseEmail } from "./accounts";

// Website sign-ups for news (and any introductory offer). Double opt-in: nobody is added
// until they click the confirmation link, which proves the address is theirs.

export type SubscribeResult = { status: "confirm-sent"; token: string; id: number } | { status: "already-subscribed" };

export async function latestMarketingChoice(db: D1Database, email: string): Promise<number | null> {
  return db.prepare("SELECT granted FROM consents WHERE email = ?1 AND kind = 'marketing_email' ORDER BY id DESC LIMIT 1").bind(email).first<number>("granted");
}

export async function subscribe(db: D1Database, emailRaw: string, source: string, geRef: string | null = null): Promise<SubscribeResult> {
  const email = normaliseEmail(emailRaw);
  if ((await latestMarketingChoice(db, email)) === 1) return { status: "already-subscribed" };
  const token = randomToken();
  const id = await db
    .prepare(
      `INSERT INTO subscribers (email, status, token_hash, source, ge_ref) VALUES (?1, 'pending', ?2, ?3, ?4)
       ON CONFLICT (email) DO UPDATE SET status = 'pending', token_hash = excluded.token_hash, source = excluded.source, ge_ref = COALESCE(excluded.ge_ref, subscribers.ge_ref)
       RETURNING id`,
    )
    .bind(email, await sha256Hex(token), source.slice(0, 40), geRef)
    .first<number>("id");
  return { status: "confirm-sent", token, id: id! };
}

/** Confirm from the emailed link. Records marketing consent. Returns the email, or null if the link is invalid. */
export async function confirmSubscription(db: D1Database, token: string): Promise<{ id: number; email: string; source: string | null; geRef: string | null; firstTime: boolean } | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `UPDATE subscribers SET status = 'confirmed', confirmed_at = datetime('now'), token_hash = NULL
       WHERE token_hash = ?1 AND created_at > datetime('now', '-7 days') RETURNING id, email, source, ge_ref`,
    )
    .bind(await sha256Hex(token))
    .first<{ id: number; email: string; source: string | null; ge_ref: string | null }>();
  if (!row) return null;
  const firstTime = (await latestMarketingChoice(db, row.email)) !== 1;
  if (firstTime) {
    const user = await db.prepare("SELECT id FROM users WHERE email = ?1 AND deleted_at IS NULL").bind(row.email).first<number>("id");
    await db
      .prepare("INSERT INTO consents (user_id, email, kind, granted, wording_version, source) VALUES (?1, ?2, 'marketing_email', 1, ?3, ?4)")
      .bind(user ?? null, row.email, CHECKOUT_CONSENTS.marketing_email.version, `signup:${row.source ?? "site"}`)
      .run();
  }
  return { id: row.id, email: row.email, source: row.source, geRef: row.ge_ref, firstTime };
}
