import { button, esc, wrap } from "../emails/templates";
import { bytesToHex, timingSafeEqual } from "../lib/crypto";
import { RichText } from "../lib/markdown";
import { recordAudit } from "./audit";
import type { Actor } from "./admin-content";
import { sendEmail, sendEmailBatch, type Email } from "./email";

// Email campaigns to members who opted in to news. Every email carries a one-click
// unsubscribe link (and List-Unsubscribe headers), and nobody gets a campaign twice.

// --- Unsubscribe links --------------------------------------------------------

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg))).slice(0, 32);
}

export const unsubscribeToken = (secret: string, email: string) => hmac(secret, `unsubscribe:${email.toLowerCase()}`);

export async function unsubscribeUrl(env: Env, email: string): Promise<string | null> {
  if (!env.ADMIN_ENC_KEY) return null;
  return `${env.SITE_URL}/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&t=${await unsubscribeToken(env.ADMIN_ENC_KEY, email)}`;
}

export async function checkUnsubscribeToken(env: Env, email: string, token: string): Promise<boolean> {
  return !!env.ADMIN_ENC_KEY && !!email && timingSafeEqual(await unsubscribeToken(env.ADMIN_ENC_KEY, email), token);
}

// --- Campaigns ------------------------------------------------------------------

export type Campaign = { id: number; subject: string; body: string; status: "draft" | "sending" | "sent"; recipients: number; created_at: string; sent_at: string | null };

export async function listCampaigns(db: D1Database): Promise<Campaign[]> {
  return (await db.prepare("SELECT * FROM campaigns ORDER BY id DESC LIMIT 100").all<Campaign>()).results;
}

export async function getCampaign(db: D1Database, id: number): Promise<Campaign | null> {
  return db.prepare("SELECT * FROM campaigns WHERE id = ?1").bind(id).first<Campaign>();
}

export async function saveCampaign(db: D1Database, id: number | null, input: { subject: string; body: string }, actor: Actor): Promise<number | null> {
  const subject = input.subject.trim().slice(0, 200);
  const body = input.body.replace(/\r\n?/g, "\n").slice(0, 50_000);
  if (!subject) return null;
  if (id == null) {
    const newId = await db.prepare("INSERT INTO campaigns (subject, body) VALUES (?1, ?2) RETURNING id").bind(subject, body).first<number>("id");
    await recordAudit(db, { actorUserId: actor.userId, action: "campaign.create", targetType: "campaign", targetId: newId!, ip: actor.ip });
    return newId;
  }
  const res = await db.prepare("UPDATE campaigns SET subject = ?1, body = ?2, updated_at = datetime('now') WHERE id = ?3 AND status = 'draft'").bind(subject, body, id).run();
  return res.meta.changes ? id : null;
}

/** Everyone whose most recent marketing choice is "yes". */
export async function marketingAudience(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT c.email FROM consents c
       WHERE c.kind = 'marketing_email' AND c.id = (SELECT MAX(c2.id) FROM consents c2 WHERE c2.kind = 'marketing_email' AND c2.email = c.email)
         AND c.granted = 1`,
    )
    .all<{ email: string }>();
  return results.map((r) => r.email.toLowerCase());
}

export async function campaignEmail(env: Env, campaign: Pick<Campaign, "subject" | "body">, to: string): Promise<Email> {
  const unsub = await unsubscribeUrl(env, to);
  const bodyHtml = String(<RichText source={campaign.body} />);
  const footer = unsub ? `<br><a href="${esc(unsub)}" style="color:#6d756f">Unsubscribe</a> from news emails.` : "";
  return {
    to,
    template: "campaign",
    subject: campaign.subject,
    html: wrap(env.SITE_NAME, `${bodyHtml}${button(env.SITE_URL, `Visit ${env.SITE_NAME}`)}`, footer),
    text: `${campaign.body}\n\n${env.SITE_URL}${unsub ? `\n\nUnsubscribe: ${unsub}` : ""}`,
    headers: unsub ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  };
}

export async function sendCampaignTest(env: Env, campaign: Campaign, to: string): Promise<void> {
  const email = await campaignEmail(env, campaign, to);
  await sendEmail(env, { ...email, subject: `[TEST] ${email.subject}`, template: "campaign_test" });
}

/** Send to everyone opted in, once. Returns how many it went to, or null if already sent. */
export async function sendCampaign(env: Env, id: number, actor: Actor): Promise<number | null> {
  const claimed = await env.DB.prepare("UPDATE campaigns SET status = 'sending', updated_at = datetime('now') WHERE id = ?1 AND status = 'draft' RETURNING *").bind(id).first<Campaign>();
  if (!claimed) return null;
  const already = new Set((await env.DB.prepare("SELECT email FROM campaign_sends WHERE campaign_id = ?1").bind(id).all<{ email: string }>()).results.map((r) => r.email.toLowerCase()));
  const audience = (await marketingAudience(env.DB)).filter((e) => !already.has(e));
  let sent = 0;
  for (let i = 0; i < audience.length; i += 100) {
    const chunk = audience.slice(i, i + 100);
    const statuses = await sendEmailBatch(env, await Promise.all(chunk.map((to) => campaignEmail(env, claimed, to))));
    await env.DB.batch(
      chunk.map((email, k) =>
        env.DB.prepare("INSERT INTO campaign_sends (campaign_id, email, status) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING").bind(id, email, statuses[k] === "failed" ? "failed" : "sent"),
      ),
    );
    sent += statuses.filter((s) => s !== "failed").length;
  }
  await env.DB.prepare("UPDATE campaigns SET status = 'sent', recipients = ?1, sent_at = datetime('now') WHERE id = ?2").bind(sent, id).run();
  await recordAudit(env.DB, { actorUserId: actor.userId, action: "campaign.send", targetType: "campaign", targetId: id, ip: actor.ip, detail: { recipients: sent } });
  return sent;
}
