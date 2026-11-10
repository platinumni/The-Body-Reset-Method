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
