// Contact form: every message is saved, then emailed to the owner once an address is set
// in Admin → Site wording. Nothing is lost while email isn't set up yet.

import { looksLikeEmail } from "./accounts";
import { sendEmail } from "./email";
import { loadSettings } from "./site-content";
import { recordAudit } from "./audit";
import type { Actor } from "./admin-content";

export const CONTACT_EMAIL_KEY = "contact.email";

export type ContactInput = { name: string; email: string; message: string };
export type ContactMessage = ContactInput & { id: number; email_status: string; handled_at: string | null; created_at: string };

export function contactProblem(input: ContactInput): string | null {
  if (!input.name || input.name.length > 100) return "Please tell us your name.";
  if (!looksLikeEmail(input.email)) return "That email address doesn't look right.";
  if (input.message.length < 10) return "Please write a little more, so we can help.";
  if (input.message.length > 5000) return "That message is a bit long. Please keep it under 5,000 characters.";
  return null;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export async function saveContactMessage(env: Env, input: ContactInput): Promise<void> {
  const id = await env.DB.prepare("INSERT INTO contact_messages (name, email, message) VALUES (?1, ?2, ?3) RETURNING id")
    .bind(input.name, input.email.toLowerCase(), input.message)
    .first<number>("id");
  const to = ((await loadSettings(env.DB)).get(CONTACT_EMAIL_KEY) ?? "").trim();
  if (!looksLikeEmail(to)) return;
  const status = await sendEmail(env, {
    to,
    template: "contact-message",
    subject: `Website message from ${input.name}`,
    text: `From: ${input.name} <${input.email}>\n\n${input.message}`,
    html: `<p><strong>From:</strong> ${escape(input.name)} &lt;${escape(input.email)}&gt;</p><p>${escape(input.message).replace(/\n/g, "<br>")}</p>`,
    headers: { "Reply-To": input.email },
  });
  await env.DB.prepare("UPDATE contact_messages SET email_status = ?1 WHERE id = ?2").bind(status, id).run();
}

export async function listContactMessages(db: D1Database): Promise<ContactMessage[]> {
  const { results } = await db.prepare("SELECT id, name, email, message, email_status, handled_at, created_at FROM contact_messages ORDER BY id DESC LIMIT 200").all<ContactMessage>();
  return results;
}

export async function markContactHandled(db: D1Database, id: number, actor: Actor): Promise<void> {
  await db.prepare("UPDATE contact_messages SET handled_at = datetime('now') WHERE id = ?1 AND handled_at IS NULL").bind(id).run();
  await recordAudit(db, { actorUserId: actor.userId, action: "contact.handled", targetType: "contact_message", targetId: id, ip: actor.ip });
}
