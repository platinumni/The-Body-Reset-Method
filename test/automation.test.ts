import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, DAILY_CRON, scheduled } from "../src/index";
import { buildMorningReport, checkUsage, sendCheckIns, sendMorningReport, sendSetupReminders } from "../src/services/automation";
import { marketingAudience, saveCampaign, sendCampaign, unsubscribeUrl } from "../src/services/campaigns";
import { productId } from "./helpers";

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const autoEnv = { ...env, ADMIN_ENC_KEY: KEY } as Env;
let seq = 0;
const uniq = (p: string) => `${p}${++seq}-${Date.now()}@example.com`;
const sqlTime = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace("T", " ").slice(0, 19);
const mailsTo = (to: string, template: string) => env.DB.prepare("SELECT COUNT(*) AS n FROM email_log WHERE to_email = ?1 AND template = ?2").bind(to, template).first<number>("n");

async function paidOrder(email: string, paidMsAgo: number) {
  const id = await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json, paid_at) VALUES (?1, ?2, 'paid', 100, '{}', ?3) RETURNING id")
    .bind(`A-${crypto.randomUUID()}`, email, sqlTime(paidMsAgo))
    .first<number>("id");
  await env.DB.prepare("INSERT INTO entitlements (email, product_id, order_id) VALUES (?1, ?2, ?3)").bind(email, await productId(env.DB, "lower-body-regeneration"), id).run();
  return id!;
}

afterEach(() => vi.restoreAllMocks());

describe("account setup reminders", () => {
  it("reminds buyers who haven't set up after 2 days, once only", async () => {
    const late = uniq("late");
    const fresh = uniq("fresh");
    await paidOrder(late, 3 * 86_400_000);
    await paidOrder(fresh, 3_600_000);
    await sendSetupReminders(env);
    await sendSetupReminders(env);
    expect(await mailsTo(late, "setup_reminder")).toBe(1);
    expect(await mailsTo(fresh, "setup_reminder")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE email = ?1 AND purpose = 'setup'").bind(late).first("n")).toBe(1);
  });

  it("doesn't remind people who already have an account", async () => {
    const done = uniq("done");
    await paidOrder(done, 3 * 86_400_000);
    await env.DB.prepare("INSERT INTO users (email, password_hash) VALUES (?1, 'x')").bind(done).run();
    await sendSetupReminders(env);
    expect(await mailsTo(done, "setup_reminder")).toBe(0);
  });
});

describe("one-week check-in", () => {
  it("emails members a week after joining, once", async () => {
    const email = uniq("week");
    const uid = await env.DB.prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?1, 'x', ?2) RETURNING id").bind(email, sqlTime(8 * 86_400_000)).first<number>("id");
    const order = await paidOrder(email, 8 * 86_400_000);
    await env.DB.prepare("UPDATE entitlements SET user_id = ?1 WHERE order_id = ?2").bind(uid, order).run();
    await sendCheckIns(env);
    await sendCheckIns(env);
    expect(await mailsTo(email, "check_in_7d")).toBe(1);
  });
});

describe("usage watch", () => {
  it("alerts the owner once a month at 80% of a limit", async () => {
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('usage.email_limit', '10') ON CONFLICT (key) DO UPDATE SET value = '10'").run();
    await env.DB.batch(Array.from({ length: 8 }, () => env.DB.prepare("INSERT INTO email_log (to_email, template, subject, status) VALUES ('x@example.com', 't', 's', 'sent')")));
    expect(await checkUsage(env, ["owner@example.com"])).toBe(true);
    expect(await checkUsage(env, ["owner@example.com"])).toBe(false);
    expect(await mailsTo("owner@example.com", "usage_alert")).toBe(1);
    await env.DB.prepare("DELETE FROM settings WHERE key = 'usage.email_limit'").run();
  });
});

describe("morning report", () => {
  it("summarises yesterday and lists what needs attention, sent once a day", async () => {
    const admin = uniq("boss");
    await env.DB.prepare("INSERT INTO users (email, role) VALUES (?1, 'admin')").bind(admin).run();
    const report = await buildMorningReport(env.DB);
    expect(report.date).toBe(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
    expect(Array.isArray(report.todo)).toBe(true);
    await env.DB.prepare("DELETE FROM automation_sent WHERE kind = 'morning-report'").run();
    expect(await sendMorningReport(env)).toBe(true);
    expect(await sendMorningReport(env)).toBe(false);
    expect(await mailsTo(admin, "morning_report")).toBe(1);
  });

  it("runs as part of the daily job without failing", async () => {
    await scheduled({ cron: DAILY_CRON, scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env);
  });
});

describe("campaigns and unsubscribe", () => {
  const optIn = (email: string, granted: 0 | 1) =>
    env.DB.prepare("INSERT INTO consents (email, kind, granted, wording_version, source) VALUES (?1, 'marketing_email', ?2, 'v', 'test')").bind(email, granted).run();

  beforeEach(async () => {
    await env.DB.prepare("UPDATE consents SET granted = 0 WHERE kind = 'marketing_email'").run(); // start each test with nobody opted in
  });

  it("only goes to people whose latest choice is yes", async () => {
    const yes = uniq("yes");
    const changed = uniq("changed");
    await optIn(yes, 1);
    await optIn(changed, 1);
    await optIn(changed, 0);
    const audience = await marketingAudience(env.DB);
    expect(audience).toContain(yes);
    expect(audience).not.toContain(changed);
  });

  it("sends once, with an unsubscribe link and one-click headers", async () => {
    const a = uniq("news");
    await optIn(a, 1);
    const batches: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("/emails/batch")) batches.push(JSON.parse(String(init?.body)));
      return Response.json({ data: [] });
    });
    const mailEnv = { ...autoEnv, RESEND_API_KEY: "re_test" } as Env;
    const id = (await saveCampaign(env.DB, null, { subject: "New programme", body: "**Hips** is here." }, { userId: 1 }))!;
    expect(await sendCampaign(mailEnv, id, { userId: 1 })).toBe(1);
    expect(await sendCampaign(mailEnv, id, { userId: 1 })).toBeNull(); // never twice
    const sent = batches[0][0];
    expect(sent.to).toEqual([a]);
    expect(sent.html).toContain("<strong>Hips</strong>");
    expect(sent.html).toContain("/unsubscribe?e=");
    expect(sent.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(await env.DB.prepare("SELECT status FROM campaigns WHERE id = ?1").bind(id).first("status")).toBe("sent");
  });

  it("one-click unsubscribe works from a mail app (no CSRF token) and is recorded", async () => {
    const email = uniq("bye");
    await optIn(email, 1);
    const url = new URL((await unsubscribeUrl(autoEnv, email))!);
    const page = await app.request(url.pathname + url.search, {}, autoEnv);
    expect(await page.text()).toContain("Unsubscribe from news emails?");
    const res = await app.request(url.pathname + url.search, { method: "POST" }, autoEnv);
    expect(res.status).toBe(200);
    expect(await marketingAudience(env.DB)).not.toContain(email);
    expect(await env.DB.prepare("SELECT source FROM consents WHERE email = ?1 ORDER BY id DESC LIMIT 1").bind(email).first("source")).toBe("unsubscribe-link");
  });

  it("rejects tampered unsubscribe links", async () => {
    const res = await app.request("/unsubscribe?e=someone@example.com&t=0000", { method: "POST" }, autoEnv);
    expect(res.status).toBe(400);
  });
});
