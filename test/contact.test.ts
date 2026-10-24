import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { formatPayday, lastWorkingDay, nextPayday } from "../src/lib/paydays";
import { affiliateSettings } from "../src/services/affiliates";
import { TestClient } from "./helpers";

describe("contact form", () => {
  it("has a page with title, description and canonical", async () => {
    const html = await (await new TestClient(env).get("/contact")).text();
    expect(html).toContain("<title>Contact | ");
    expect(html).toContain('rel="canonical" href="http://localhost:8787/contact"');
    expect(html).toContain('name="_csrf"');
  });

  it("saves a valid message, even before an email address is set", async () => {
    const client = new TestClient(env);
    await client.get("/contact");
    const email = `ask-${Date.now()}@example.com`;
    const res = await client.post("/contact", { name: "Sam", email, message: "How long do I keep access to the programme?" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/contact?sent");
    const row = await env.DB.prepare("SELECT name, message, email_status FROM contact_messages WHERE email = ?1").bind(email).first<any>();
    expect(row).toMatchObject({ name: "Sam", email_status: "not-sent" });
  });

  it("emails the owner once an address is set (logged as skipped without an email key)", async () => {
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('contact.email', 'owner@example.com') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
    try {
      const client = new TestClient(env);
      await client.get("/contact");
      const email = `fwd-${Date.now()}@example.com`;
      await client.post("/contact", { name: "Jo", email, message: "A question about the core programme." });
      const row = await env.DB.prepare("SELECT email_status FROM contact_messages WHERE email = ?1").bind(email).first<any>();
      expect(row.email_status).toBe("skipped");
      expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM email_log WHERE to_email = 'owner@example.com' AND template = 'contact-message'").first("n")).toBeGreaterThan(0);
    } finally {
      await env.DB.prepare("UPDATE settings SET value = '' WHERE key = 'contact.email'").run();
    }
  });

  it("rejects bad input and quietly drops bots", async () => {
    const client = new TestClient(env);
    await client.get("/contact");
    expect((await client.post("/contact", { name: "Sam", email: "nope", message: "Hello there, a question." })).status).toBe(422);
    const bot = `bot-${Date.now()}@example.com`;
    expect((await client.post("/contact", { name: "Bot", email: bot, message: "Buy cheap things now!!", website: "http://spam" })).status).toBe(303);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM contact_messages WHERE email = ?1").bind(bot).first("n")).toBe(0);
  });
});

describe("affiliate paydays", () => {
  it("is the last working day of the month, skipping weekends and the late May and August bank holidays", () => {
    const day = (s: string) => lastWorkingDay(new Date(`${s}T12:00:00Z`)).toISOString().slice(0, 10);
    expect(day("2027-04-15")).toBe("2027-04-30"); // a Friday
    expect(day("2026-10-02")).toBe("2026-10-30"); // 31st is a Saturday
    expect(day("2027-05-10")).toBe("2027-05-28"); // 31 May 2027 is the spring bank holiday
    expect(day("2026-08-01")).toBe("2026-08-28"); // 31 Aug 2026 is the summer bank holiday
  });

  it("moves to next month once this month's payday has passed", () => {
    expect(nextPayday(new Date("2026-10-31T09:00:00Z")).toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(nextPayday(new Date("2026-10-30T09:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-30");
    expect(formatPayday(new Date("2026-10-30T00:00:00Z"))).toBe("Friday 30 October 2026");
  });

  it("holds commission for 90 days by default, matching the guarantee", async () => {
    const stored = await env.DB.prepare("SELECT value FROM settings WHERE key = 'affiliate.hold_days'").first<string>("value");
    if (stored == null) expect((await affiliateSettings(env.DB)).holdDays).toBe(90);
  });
});
