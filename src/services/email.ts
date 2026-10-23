// Sending email through Resend, with every attempt written to email_log.
// Without RESEND_API_KEY (local dev, tests) emails are logged as "skipped", not sent.

export type Email = { to: string; template: string; subject: string; html: string; text: string; headers?: Record<string, string> };

export async function sendEmail(env: Env, email: Email): Promise<"sent" | "failed" | "skipped"> {
  let status: "sent" | "failed" | "skipped" = "skipped";
  let providerId: string | null = null;
  let error: string | null = null;

  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, html: email.html, text: email.text, ...(email.headers ? { headers: email.headers } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok) {
        status = "sent";
        providerId = body.id ?? null;
      } else {
        status = "failed";
        error = body.message ?? `Resend error ${res.status}`;
      }
    } catch (err) {
      status = "failed";
      error = String(err);
    }
  }

  await env.DB.prepare("INSERT INTO email_log (to_email, template, subject, status, provider_id, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(email.to, email.template, email.subject, status, providerId, error?.slice(0, 500) ?? null)
    .run();
  if (status === "failed") console.error("Email failed", { template: email.template, error });
  return status;
}

export type EmailLogRow = { id: number; to_email: string; template: string; subject: string; status: string; created_at: string };

export async function listEmailLog(db: D1Database, limit = 50): Promise<EmailLogRow[]> {
  const { results } = await db.prepare("SELECT id, to_email, template, subject, status, created_at FROM email_log ORDER BY id DESC LIMIT ?1").bind(limit).all<EmailLogRow>();
  return results;
}

/**
 * Send up to 100 emails in one call (Resend batch API), logging each one.
 * Used for campaigns, where one-by-one sending would hit rate limits.
 */
export async function sendEmailBatch(env: Env, emails: Email[]): Promise<("sent" | "failed" | "skipped")[]> {
  if (!emails.length) return [];
  let statuses: ("sent" | "failed" | "skipped")[] = emails.map(() => "skipped");
  let error: string | null = null;
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(emails.map((e) => ({ from: env.EMAIL_FROM, to: [e.to], subject: e.subject, html: e.html, text: e.text, ...(e.headers ? { headers: e.headers } : {}) }))),
      });
      statuses = emails.map(() => (res.ok ? "sent" : "failed"));
      if (!res.ok) error = `Resend batch error ${res.status}: ${(await res.text()).slice(0, 300)}`;
    } catch (err) {
      statuses = emails.map(() => "failed");
      error = String(err);
    }
  }
  await env.DB.batch(
    emails.map((e, i) =>
      env.DB.prepare("INSERT INTO email_log (to_email, template, subject, status, error) VALUES (?1, ?2, ?3, ?4, ?5)").bind(e.to, e.template, e.subject, statuses[i], error),
    ),
  );
  if (error) console.error("Email batch failed", { error });
  return statuses;
}
