import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sessionForDay, TEAM_SESSIONS } from "../src/content/team-sessions";
import { createEmailToken } from "../src/services/email-tokens";
import { streakFrom, ukDay, weekStart } from "../src/services/team";
import { productId, TestClient } from "./helpers";

const PW = "a long enough password";
let seq = 0;

/** A member with these products (e.g. an employee whose workplace code gave them team wellbeing and a course). */
async function member(slugs: string[]) {
  const email = `team${++seq}-${Date.now()}@example.com`;
  const order = await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json) VALUES (?1, ?2, 'paid', 0, '{}') RETURNING id").bind(`T-${crypto.randomUUID()}`, email).first<number>("id");
  for (const slug of slugs) await env.DB.prepare("INSERT INTO entitlements (email, product_id, order_id) VALUES (?1, ?2, ?3)").bind(email, await productId(env.DB, slug), order).run();
  const token = await createEmailToken(env.DB, "setup", email, order);
  const client = new TestClient(env);
  await client.post("/account/setup", { token, password: PW, confirm: PW });
  const userId = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first<number>("id");
  return { client, email, userId: userId! };
}

describe("team wellbeing dashboard", () => {
  it("works out weeks, streaks and today's session", () => {
    expect(weekStart("2026-11-12")).toBe("2026-11-09"); // a Thursday → its Monday
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(streakFrom(new Set(["2026-11-10", "2026-11-11", "2026-11-12"]), "2026-11-12")).toBe(3);
    expect(streakFrom(new Set(["2026-11-10", "2026-11-11"]), "2026-11-12")).toBe(2); // today not done yet still counts yesterday's run
    expect(streakFrom(new Set(["2026-11-09"]), "2026-11-12")).toBe(0);
    expect(TEAM_SESSIONS.length).toBeGreaterThanOrEqual(3);
    expect(sessionForDay("2026-11-10").id).not.toBe(sessionForDay("2026-11-11").id);
    expect(ukDay(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01"); // UK summer time
  });

  it("is only for employees whose workplace gave them access", async () => {
    const { client } = await member(["hips"]);
    const res = await client.get("/account/team");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/account");
  });

  it("shows today's session, their numbers, courses and the meal planner, and the account page links to it", async () => {
    const { client } = await member(["teams", "lower-body-regeneration"]);
    expect(await (await client.get("/account")).text()).toContain('href="/account/team"');
    const html = await (await client.get("/account/team")).text();
    expect(html).toContain("Today&#39;s session");
    expect(html).toContain("How you&#39;re getting on");
    expect(html).toContain("Sessions each week");
    expect(html).toContain('href="/account/meal-plans"');
    expect(html).toContain("Lower Body");
    expect(html).toContain("not medical advice");
  });

  it("logs a session once a day and updates the streak and chart", async () => {
    const { client, userId } = await member(["teams"]);
    const today = ukDay();
    const session = sessionForDay(today);
    await client.post("/account/team/done", { session: session.id });
    await client.post("/account/team/done", { session: session.id }); // twice in a day counts once
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM wellbeing_activity WHERE user_id = ?1").bind(userId).first("n")).toBe(1);
    const html = await (await client.get("/account/team")).text();
    expect(html).toContain("Done for today");
    expect(html).toMatch(/<p class="stat-value">1<\/p><p class="stat-label">day in a row/);
    expect(html).toContain("1 session, 5 min");
    await client.post("/account/team/done", { session: "not-a-session" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM wellbeing_activity WHERE user_id = ?1").bind(userId).first("n")).toBe(1);
  });

  it("gives employees the meal planner as its own page, with a way back to the dashboard", async () => {
    const { client } = await member(["teams"]);
    const res = await client.get("/account/meal-plans");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="/account/team"');
  });

  it("includes their sessions in their data export, and deletes them with the account", async () => {
    const { client, userId } = await member(["teams"]);
    await client.post("/account/team/done", { session: sessionForDay(ukDay()).id });
    const data = (await (await client.get("/account/export")).json()) as Record<string, unknown[]>;
    expect(data.wellbeingSessions).toHaveLength(1);
    const { deleteAccount } = await import("../src/services/accounts");
    await deleteAccount(env.DB, userId, { userId });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM wellbeing_activity WHERE user_id = ?1").bind(userId).first("n")).toBe(0);
  });
});

describe("team wellbeing: mood, week planner and diary", () => {
  const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

  async function employee() {
    const m = await member(["teams"]);
    // The diary needs the encryption key, as on the real site.
    (m.client as unknown as { env: Env }).env = { ...env, ADMIN_ENC_KEY: KEY } as Env;
    return m;
  }

  it("records today's mood (changeable), shows it on the dashboard chart, and keeps it private", async () => {
    const { client, userId } = await employee();
    await client.post("/account/team/mood", { mood: "2" });
    await client.post("/account/team/mood", { mood: "4" }); // changed their mind
    await client.post("/account/team/mood", { mood: "9" }); // nonsense is ignored
    const rows = await env.DB.prepare("SELECT mood FROM wellbeing_checkins WHERE user_id = ?1").bind(userId).all<{ mood: number }>();
    expect(rows.results).toEqual([{ mood: 4 }]);
    const html = await (await client.get("/account/team")).text();
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Your mood over the last 14 days");
    expect(html).toContain("Your employer never does");
    expect(html).toContain("116 123");
  });

  it("plans the week: add, tick done, remove, and today's plans show on the dashboard", async () => {
    const { client, userId } = await employee();
    const today = ukDay();
    await client.post("/account/team/plan", { action: "add", day: today, time: "07:30", kind: "session", title: "Toe yoga before work" });
    const bad = await client.post("/account/team/plan", { action: "add", day: today, time: "25:99", kind: "session", title: "x" });
    expect(bad.headers.get("location")).toContain("error=");
    const week = await (await client.get("/account/team/week")).text();
    expect(week).toContain("07:30");
    expect(week).toContain("Toe yoga before work");
    expect(await (await client.get("/account/team")).text()).toContain("Toe yoga before work");
    const id = await env.DB.prepare("SELECT id FROM wellbeing_plans WHERE user_id = ?1").bind(userId).first<number>("id");
    await client.post("/account/team/plan", { action: "done", id: String(id), day: today });
    expect(await env.DB.prepare("SELECT done_at IS NOT NULL AS d FROM wellbeing_plans WHERE id = ?1").bind(id).first("d")).toBe(1);
    await client.post("/account/team/plan", { action: "delete", id: String(id), day: today });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM wellbeing_plans WHERE user_id = ?1").bind(userId).first("n")).toBe(0);
  });

  it("someone else's plan can't be changed", async () => {
    const a = await employee();
    const b = await employee();
    await a.client.post("/account/team/plan", { action: "add", day: ukDay(), time: "", kind: "other", title: "Mine" });
    const id = await env.DB.prepare("SELECT id FROM wellbeing_plans WHERE user_id = ?1").bind(a.userId).first<number>("id");
    await b.client.post("/account/team/plan", { action: "delete", id: String(id), day: ukDay() });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM wellbeing_plans WHERE id = ?1").bind(id).first("n")).toBe(1);
  });

  it("keeps a private diary, stored encrypted, in the export, deleted with the account", async () => {
    const { client, userId } = await employee();
    await client.post("/account/team/diary", { day: ukDay(), body: "Let go of the grip in my toes today." });
    const stored = await env.DB.prepare("SELECT body_enc FROM wellbeing_diary WHERE user_id = ?1").bind(userId).first<string>("body_enc");
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain("grip");
    expect(await (await client.get("/account/team/diary")).text()).toContain("Let go of the grip in my toes today.");
    const data = (await (await client.get("/account/export")).json()) as Record<string, any[]>;
    expect(data.diary![0].text).toBe("Let go of the grip in my toes today.");
    const { deleteAccount } = await import("../src/services/accounts");
    await deleteAccount(env.DB, userId, { userId });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM wellbeing_diary WHERE user_id = ?1").bind(userId).first("n")).toBe(0);
  });

  it("is only for employees with team wellbeing", async () => {
    const { client } = await member(["hips"]);
    for (const path of ["/account/team/week", "/account/team/diary"]) expect((await client.get(path)).headers.get("location")).toBe("/account");
  });
});

describe("team wellbeing: today's thought and daily words", () => {
  it("shows a daily thought that changes each day", async () => {
    const { thoughtForDay, REFLECTIONS } = await import("../src/content/reflections");
    expect(REFLECTIONS.length).toBeGreaterThanOrEqual(30);
    expect(thoughtForDay("2026-11-10", null).reflection).not.toBe(thoughtForDay("2026-11-11", null).reflection);
    const { client } = await member(["teams"]);
    const html = await (await client.get("/account/team")).text();
    expect(html).toContain("Today&#39;s thought");
    expect(html).toContain("Add words from your faith or belief (optional)");
  });

  it("saves a faith or belief only with explicit consent, records the consent, and removes it on 'None'", async () => {
    const { client, userId, email } = await member(["teams"]);
    const refused = await client.post("/account/team/words", { tradition: "christian" });
    expect(refused.headers.get("location")).toContain("words=consent");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM wellbeing_prefs WHERE user_id = ?1").bind(userId).first("n")).toBe(0);
    await client.post("/account/team/words", { tradition: "christian", consent: "yes" });
    expect(await env.DB.prepare("SELECT tradition FROM wellbeing_prefs WHERE user_id = ?1").bind(userId).first("tradition")).toBe("christian");
    expect(await env.DB.prepare("SELECT granted FROM consents WHERE email = ?1 AND kind = 'belief_preference' ORDER BY id DESC").bind(email).first("granted")).toBe(1);
    const html = await (await client.get("/account/team")).text();
    expect(html).toContain("Your daily words: Christian");
    expect(html).toContain("are being prepared and checked"); // no unverified quotes are ever shown
    await client.post("/account/team/words", { tradition: "none" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM wellbeing_prefs WHERE user_id = ?1").bind(userId).first("n")).toBe(0);
    expect(await env.DB.prepare("SELECT granted FROM consents WHERE email = ?1 AND kind = 'belief_preference' ORDER BY id DESC").bind(email).first("granted")).toBe(0);
  });
});
