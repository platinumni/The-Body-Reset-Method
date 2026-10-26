import { checkInEmail, commissionReadyEmail, morningReportEmail, reviewRequestEmail, setupReminderEmail, usageAlertEmail } from "../emails/automation";
import { dashboardNumbers } from "./admin-ops";
import { createEmailToken } from "./email-tokens";
import { sendEmail } from "./email";
import { loadSettings } from "./site-content";

// Daily automatic jobs. Each email is recorded in automation_sent so it goes once only,
// even if the job runs twice.

/** Claim a one-time send. Returns false if it was already done. */
async function claim(db: D1Database, kind: string, ref: string): Promise<boolean> {
  const res = await db.prepare("INSERT INTO automation_sent (kind, ref) VALUES (?1, ?2) ON CONFLICT DO NOTHING").bind(kind, ref).run();
  return res.meta.changes === 1;
}

/** Buyers who haven't created their account 2 days after paying get one fresh link. */
export async function sendSetupReminders(env: Env, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 2 * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.email FROM orders o
     WHERE o.status = 'paid' AND o.email IS NOT NULL AND o.paid_at <= ?1 AND o.paid_at > datetime(?1, '-14 days')
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = o.email AND u.password_hash IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM automation_sent a WHERE a.kind = 'setup-reminder' AND a.ref = o.email)
       AND EXISTS (SELECT 1 FROM entitlements e WHERE e.order_id = o.id AND e.revoked_at IS NULL)
     GROUP BY o.email LIMIT 200`,
  )
    .bind(cutoff)
    .all<{ id: number; email: string }>();
  let sent = 0;
  for (const r of results) {
    if (!(await claim(env.DB, "setup-reminder", r.email))) continue;
    const token = await createEmailToken(env.DB, "setup", r.email, r.id);
    await sendEmail(env, setupReminderEmail({ siteName: env.SITE_NAME, to: r.email, url: `${env.SITE_URL}/account/setup?token=${token}` }));
    sent++;
  }
  return sent;
}

/** A week after creating their account, members get a short "getting the most from it" email. */
export async function sendCheckIns(env: Env, now = new Date()): Promise<number> {
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM users u
     WHERE u.role = 'customer' AND u.deleted_at IS NULL AND u.password_hash IS NOT NULL
       AND u.created_at <= ?1 AND u.created_at > ?2
       AND EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = u.id AND e.revoked_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM automation_sent a WHERE a.kind = 'check-in-7d' AND a.ref = CAST(u.id AS TEXT))
     LIMIT 200`,
  )
    .bind(day(7), day(21))
    .all<{ id: number; email: string; name: string | null }>();
  let sent = 0;
  for (const u of results) {
    if (!(await claim(env.DB, "check-in-7d", String(u.id)))) continue;
    await sendEmail(env, checkInEmail({ siteName: env.SITE_NAME, to: u.email, name: u.name, url: `${env.SITE_URL}/account` }));
    sent++;
  }
  return sent;
}

/** About three weeks after joining, ask members (once) how it's going and invite a review. */
export async function sendReviewRequests(env: Env, now = new Date()): Promise<number> {
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM users u
     WHERE u.role = 'customer' AND u.deleted_at IS NULL AND u.password_hash IS NOT NULL
       AND u.created_at <= ?1 AND u.created_at > ?2
       AND EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = u.id AND e.revoked_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM automation_sent a WHERE a.kind = 'review-request' AND a.ref = CAST(u.id AS TEXT))
     LIMIT 200`,
  )
    .bind(day(21), day(45))
    .all<{ id: number; email: string; name: string | null }>();
  let sent = 0;
  for (const u of results) {
    if (!(await claim(env.DB, "review-request", String(u.id)))) continue;
    await sendEmail(env, reviewRequestEmail({ siteName: env.SITE_NAME, to: u.email, name: u.name, url: `${env.SITE_URL}/account/review` }));
    sent++;
  }
  return sent;
}

/** Tell affiliates when held commission becomes theirs. */
export async function notifyReleasedCommission(env: Env, released: { affiliate_id: number; amount_pence: number }[]): Promise<number> {
  const totals = new Map<number, number>();
  for (const r of released) totals.set(r.affiliate_id, (totals.get(r.affiliate_id) ?? 0) + r.amount_pence);
  let sent = 0;
  for (const [affiliateId, pence] of totals) {
    const row = await env.DB.prepare("SELECT u.email FROM affiliates a JOIN users u ON u.id = a.user_id WHERE a.id = ?1 AND u.deleted_at IS NULL").bind(affiliateId).first<{ email: string }>();
    if (!row) continue;
    await sendEmail(env, commissionReadyEmail({ siteName: env.SITE_NAME, to: row.email, pence, url: `${env.SITE_URL}/account#share` }));
    sent++;
  }
  return sent;
}

// --- Usage watch ------------------------------------------------------------

export type Usage = { month: string; emailsSent: number; emailLimit: number; pageViews: number; requestLimit: number };

/** This month's usage against plan limits (owner can change the limits in settings). */
export async function usageThisMonth(db: D1Database, now = new Date()): Promise<Usage> {
  const month = now.toISOString().slice(0, 7);
  const s = await loadSettings(db);
  const emailsSent =
    (await db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE status = 'sent' AND substr(created_at, 1, 7) = ?1").bind(month).first<number>("n")) ?? 0;
  const pageViews = (await db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM daily_stats WHERE metric = 'view' AND substr(day, 1, 7) = ?1").bind(month).first<number>("n")) ?? 0;
  return {
    month,
    emailsSent,
    emailLimit: Number(s.get("usage.email_limit")) || 3000, // Resend free plan
    pageViews,
    requestLimit: Number(s.get("usage.request_limit")) || 10_000_000, // Workers paid plan
  };
}

/** Email the owner once a month if any usage passes 80% of its limit. */
export async function checkUsage(env: Env, admins: string[], now = new Date()): Promise<boolean> {
  const u = await usageThisMonth(env.DB, now);
  const over = [
    u.emailsSent >= 0.8 * u.emailLimit ? `Emails: ${u.emailsSent} of ${u.emailLimit} this month` : null,
    u.pageViews >= 0.8 * u.requestLimit ? `Page views: ${u.pageViews} of ${u.requestLimit} this month` : null,
  ].filter((x): x is string => !!x);
  if (!over.length || !admins.length || !(await claim(env.DB, "usage-80", u.month))) return false;
  for (const to of admins) await sendEmail(env, usageAlertEmail({ siteName: env.SITE_NAME, to, lines: over, url: `${env.SITE_URL}/admin` }));
  return true;
}

// --- Morning report ---------------------------------------------------------

export type MorningReport = {
  date: string;
  salesYesterday: { count: number; pence: number };
  newMembersYesterday: number;
  viewsYesterday: number;
  todo: string[];
};

export async function buildMorningReport(db: D1Database, now = new Date()): Promise<MorningReport> {
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const sales = await db
    .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_pence), 0) AS pence FROM orders WHERE status = 'paid' AND total_pence > 0 AND substr(paid_at, 1, 10) = ?1")
    .bind(yesterday)
    .first<{ count: number; pence: number }>();
  const newMembers = (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'customer' AND substr(created_at, 1, 10) = ?1").bind(yesterday).first<number>("n")) ?? 0;
  const views = (await db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM daily_stats WHERE metric = 'view' AND day = ?1").bind(yesterday).first<number>("n")) ?? 0;
  const n = await dashboardNumbers(db);
  const owed = await db
    .prepare("SELECT COUNT(DISTINCT affiliate_id) AS people, COALESCE(SUM(amount_pence), 0) AS pence FROM commissions WHERE status = 'approved'")
    .first<{ people: number; pence: number }>();
  const todo: string[] = [];
  if (n.onSale === 0) todo.push("Nothing is on sale yet: set a price and put a programme on sale.");
  if (n.draftLessons > 0) todo.push(`${n.draftLessons} programme section(s) are still drafts, waiting for you to check and publish.`);
  if (owed && owed.pence > 0) todo.push(`Affiliate commission is owed to ${owed.people} member(s). Record payouts in Admin → Affiliates.`);
  if (n.emailsFailed7 > 0) todo.push(`${n.emailsFailed7} email(s) failed to send this week. See Admin → Emails.`);
  if (!n.lastBackup || n.lastBackup.status !== "ok") todo.push("The last database backup didn't succeed. See Admin → Backups.");
  return { date: yesterday, salesYesterday: sales ?? { count: 0, pence: 0 }, newMembersYesterday: newMembers, viewsYesterday: views, todo };
}

export async function adminEmails(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT email FROM users WHERE role = 'admin' AND deleted_at IS NULL").all<{ email: string }>();
  return results.map((r) => r.email);
}

export async function sendMorningReport(env: Env, now = new Date()): Promise<boolean> {
  const admins = await adminEmails(env.DB);
  const report = await buildMorningReport(env.DB, now);
  if (!admins.length || !(await claim(env.DB, "morning-report", report.date))) return false;
  for (const to of admins) await sendEmail(env, morningReportEmail({ siteName: env.SITE_NAME, to, report, url: `${env.SITE_URL}/admin` }));
  return true;
}
