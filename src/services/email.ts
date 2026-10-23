// Sending email through Resend, with every attempt written to email_log.
// Without RESEND_API_KEY (local dev, tests) emails are logged as "skipped", not sent.

export type Email = { to: string; template: string; subject: string; html: string; text: string };

export async function sendEmail(env: Env, email: Email): Promise<"sent" | "failed" | "skipped"> {
  let status: "sent" | "failed" | "skipped" = "skipped";
  let providerId: string | null = null;
  let error: string | null = null;

  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
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
