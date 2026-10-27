import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { sendFreeWeekFollowUps } from "../src/services/automation";
import { TestClient } from "./helpers";

const kEnv = { ...env, RESEND_API_KEY: "re_test" } as Env;
let mails: any[] = [];
let seq = 0;
const uniq = (p: string) => `${p}${++seq}-${Date.now()}@example.com`;
const tokenIn = (m: any) => /\/kitchen\/week\?token=([0-9a-f]+)/.exec(m.text)?.[1];

beforeEach(() => {
  mails = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).includes("resend.com")) {
      mails.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "em_1" });
    }
    throw new Error("unexpected fetch " + String(input));
  });
});
afterEach(() => vi.restoreAllMocks());

const ask = (c: TestClient, fields: Record<string, string>) => c.post("/kitchen/free-week", { submitted: "yes", budget: "35", country: "uk", store: "mid", adults: "2", diet: "any", snacks: "yes", ...fields });

describe("Kitchen free week", () => {
  it("shows the form with an honest note about the one follow-up email", async () => {
    const html = await (await app.request("/kitchen/free-week", {}, kEnv)).text();
    expect(html).toContain("one email at the end of the week");
    expect(html).toContain('name="marketing"');
  });

  it("shows the week's meals and total straight away, but not the ingredients or the shopping list", async () => {
    const c = new TestClient(kEnv);
    const res = await ask(c, { email: uniq("fw") });
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Your week of meals: about £");
    expect(html).toContain("Teas");
    expect(html).toContain("A taste of the recipes");
    expect(html).not.toContain("Shopping list</h2>");
    expect(html).not.toMatch(/<li[^>]*>\s*\d+ ?g /); // no ingredient amounts
    expect(html).toContain("Always check product labels for allergens");
    expect(html).not.toMatch(/live (food )?prices/i);
  });

  it("emails a link; opening it confirms the address, and a news opt-in is recorded only then", async () => {
    const email = uniq("fwv");
    const c = new TestClient(kEnv);
    await ask(c, { email, marketing: "yes" });
    expect(mails[0].subject).toBe("Your free week of meals is ready");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM consents WHERE email = ?1").bind(email).first("n")).toBe(0);
    const week = await c.get(`/kitchen/week?token=${tokenIn(mails[0])}`);
    expect(week.status).toBe(200);
    expect(await env.DB.prepare("SELECT granted FROM consents WHERE email = ?1 AND kind = 'marketing_email'").bind(email).first("granted")).toBe(1);
    expect(await env.DB.prepare("SELECT verified_at IS NOT NULL AS v FROM kitchen_trials WHERE email = ?1").bind(email).first("v")).toBe(1);
  });

  it("never saves allergies", async () => {
    const email = uniq("fwa");
    await ask(new TestClient(kEnv), { email, allergens: "milk" });
    const row = await env.DB.prepare("SELECT inputs_json FROM kitchen_trials WHERE email = ?1").bind(email).first<string>("inputs_json");
    expect(row).not.toContain("milk");
    expect(row).not.toContain("allerg");
  });

  it("gives one free week per email: asking again shows the same week", async () => {
    const email = uniq("fw2");
    const c = new TestClient(kEnv);
    await ask(c, { email, budget: "30" });
    const again = await (await ask(c, { email, budget: "90" })).text();
    expect(again).toContain("already had a free week");
    expect(again).toContain("Budget £30");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM kitchen_trials WHERE email = ?1").bind(email).first("n")).toBe(1);
  });

  it("sends the one follow-up a week later, only to confirmed addresses, once", async () => {
    const yes = uniq("fwf");
    const no = uniq("fwn");
    const c = new TestClient(kEnv);
    await ask(c, { email: yes });
    await c.get(`/kitchen/week?token=${tokenIn(mails[0])}`);
    await ask(new TestClient(kEnv), { email: no });
    const later = new Date(Date.now() + 8 * 86_400_000);
    await sendFreeWeekFollowUps(kEnv, later);
    await sendFreeWeekFollowUps(kEnv, later);
    const followUps = mails.filter((m) => m.subject === "Want next week's plan?");
    expect(followUps.map((m) => m.to[0])).toContain(yes);
    expect(followUps.map((m) => m.to[0])).not.toContain(no);
    expect(followUps.filter((m) => m.to[0] === yes)).toHaveLength(1);
  });

  it("rejects a bad email and a bad link", async () => {
    expect((await ask(new TestClient(kEnv), { email: "nope" })).status).toBe(422);
    const res = await app.request("/kitchen/week?token=abc", {}, kEnv);
    expect(res.status).toBe(302);
  });
});
