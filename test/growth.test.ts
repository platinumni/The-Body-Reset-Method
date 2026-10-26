import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { withGe } from "../src/middleware/ge";
import { queueEngineEvent, sendEngineEvents } from "../src/services/growth-engine";
import { runSequences } from "../src/services/sequences";
import { signWebhook } from "../src/services/payments/stripe";
import { putOnSale, TestClient } from "./helpers";

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const ENGINE = "https://engine.example/api/events";
const WHSEC = "whsec_growth";
const gEnv = { ...env, RESEND_API_KEY: "re_test", ADMIN_ENC_KEY: KEY, STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: WHSEC, GROWTH_ENGINE_URL: ENGINE, GROWTH_ENGINE_KEY: "engine-key" } as Env;
let mails: any[] = [];
let engine: { body: any; auth: string | null }[] = [];
let stripe: URLSearchParams[] = [];
let engineDown = false;
let seq = 0;
const uniq = (p: string) => `${p}${++seq}-${Date.now()}@example.com`;
const linkIn = (email: any, path: string) => new RegExp(`${path}\\?token=([0-9a-f]+)`).exec(email.text)?.[1];

beforeEach(() => {
  mails = [];
  engine = [];
  stripe = [];
  engineDown = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const u = String(input);
    if (u.includes("resend.com")) {
      mails.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "em_1" });
    }
    if (u === ENGINE) {
      if (engineDown) throw new Error("engine unreachable");
      engine.push({ body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("Authorization") });
      return Response.json({ ok: true });
    }
    if (u.includes("stripe.com")) {
      stripe.push(new URLSearchParams(String(init?.body)));
      return Response.json({ id: `cs_${crypto.randomUUID()}`, url: "https://checkout.stripe.com/x" });
    }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("carrying the ge campaign code (no cookies)", () => {
  it("adds ge to the site's own links, not to admin or other sites", () => {
    expect(withGe("/kitchen", "abc")).toBe("/kitchen?ge=abc");
    expect(withGe("/basket?x=1#top", "abc")).toBe("/basket?x=1&ge=abc#top");
    expect(withGe("/admin/orders", "abc")).toBe("/admin/orders");
    expect(withGe("https://other.example/", "abc")).toBe("https://other.example/");
    expect(withGe("/kitchen?ge=old", "abc")).toBe("/kitchen?ge=old");
  });

  it("rewrites links and forms on a page opened with ?ge=, and sets no cookie for it", async () => {
    const res = await app.request("/?ge=spring_01", {}, gEnv);
    const html = await res.text();
    expect(html).toContain('href="/programmes?ge=spring_01"');
    expect(html).toContain('name="ge" value="spring_01"');
    expect(res.headers.getSetCookie().join(";")).not.toContain("spring_01");
  });

  it("ignores bad values", async () => {
    const html = await (await app.request("/?ge=%3Cscript%3E", {}, gEnv)).text();
    expect(html).not.toContain('name="ge"');
  });

  it("keeps ge through the basket and saves it on the order and in Stripe's metadata", async () => {
    await putOnSale(env.DB, "lower-body-regeneration", 4900);
    const c = new TestClient(gEnv);
    const add = await c.post("/basket/add", { slug: "lower-body-regeneration", ge: "camp1" });
    expect(add.headers.get("Location")).toBe("/basket?ge=camp1");
    await c.post("/checkout", { health_declaration: "yes", terms: "yes", immediate_access: "yes", ge: "camp1" });
    const order = await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<any>();
    expect(order.ge_ref).toBe("camp1");
    expect(stripe.at(-1)!.get("metadata[ge]")).toBe("camp1");
    expect(stripe.at(-1)!.get("payment_intent_data[metadata][ge]")).toBe("camp1");
  });
});

describe("growth engine reporting", () => {
  it("reports a confirmed purchase once, with no personal details, and a refund", async () => {
    await putOnSale(env.DB, "lower-body-regeneration", 4900);
    const c = new TestClient(gEnv);
    await c.post("/basket/add", { slug: "lower-body-regeneration" });
    await c.post("/checkout", { health_declaration: "yes", terms: "yes", immediate_access: "yes", ge: "camp2" });
    const order = await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<any>();
    const event = {
      id: `evt_${order.public_id}`,
      type: "checkout.session.completed",
      data: { object: { id: order.stripe_session_id, client_reference_id: order.public_id, payment_status: "paid", amount_total: 4900, currency: "gbp", payment_intent: `pi_${order.public_id}`, customer_details: { email: uniq("buyer"), name: "Sam" } } },
    };
    const send = async (e: object) => {
      const payload = JSON.stringify(e);
      return app.request("/webhooks/stripe", { method: "POST", body: payload, headers: { "Stripe-Signature": await signWebhook(WHSEC, payload) } }, gEnv);
    };
    expect((await send(event)).status).toBe(200);
    const purchase = engine.find((e) => e.body.type === "purchase" && e.body.external_id === order.public_id)!;
    expect(purchase.auth).toBe("Bearer engine-key");
    expect(purchase.body).toMatchObject({ type: "purchase", ref: "camp2", value_pence: 4900, confirmed: true });
    expect(JSON.stringify(purchase.body)).not.toMatch(/@|Sam/);
    await send({ id: `evt_r_${order.public_id}`, type: "charge.refunded", data: { object: { refunded: true, payment_intent: `pi_${order.public_id}` } } });
    expect(engine.some((e) => e.body.type === "refund" && e.body.external_id === `refund-${order.public_id}`)).toBe(true);
  });

  it("keeps events when the engine is down, and sends them later", async () => {
    engineDown = true;
    const id = `test-${crypto.randomUUID()}`;
    await queueEngineEvent(env.DB, { type: "signup", ref: null, code: null, value_pence: 0, external_id: id });
    await queueEngineEvent(env.DB, { type: "signup", ref: null, code: null, value_pence: 0, external_id: id }); // repeat ignored
    await sendEngineEvents(gEnv);
    expect((await env.DB.prepare("SELECT status, attempts FROM engine_events WHERE external_id = ?1").bind(id).first<any>())).toMatchObject({ status: "pending", attempts: 1 });
    engineDown = false;
    await sendEngineEvents(gEnv);
    expect(engine.filter((e) => e.body.external_id === id)).toHaveLength(1);
    expect((await env.DB.prepare("SELECT status FROM engine_events WHERE external_id = ?1").bind(id).first("status"))).toBe("sent");
  });

  it("does nothing without the engine's address and key", async () => {
    expect(await sendEngineEvents({ ...gEnv, GROWTH_ENGINE_KEY: undefined } as Env)).toBe(0);
  });
});

describe("Method taster", () => {
  it("has a sign-up page", async () => {
    const html = await (await app.request("/taster", {}, gEnv)).text();
    expect(html).toContain('value="taster"');
    expect(html).toContain("Day 3: Single-leg balance");
  });

  it("confirms by email, sends day 1 at once, then days 2 and 3 on the next days, with the buy link on day 3", async () => {
    const email = uniq("taster");
    const c = new TestClient(gEnv);
    await c.post("/subscribe", { email, source: "taster", ge: "tst" });
    expect(mails[0].subject).toContain("3 free exercises");
    expect(engine.some((e) => e.body.type === "lead" && e.body.ref === "tst")).toBe(true);
    await c.get(`/subscribe/confirm?token=${linkIn(mails[0], "/subscribe/confirm")}`);
    expect(mails.map((m) => m.subject)).toContain("Day 1 of 3: the short foot");
    expect(mails.some((m) => m.subject.startsWith("Welcome"))).toBe(false);
    expect(engine.some((e) => e.body.type === "signup" && e.body.ref === "tst")).toBe(true);

    const later = (h: number) => new Date(Date.now() + h * 3_600_000);
    await runSequences(gEnv, later(2)); // too soon
    expect(mails.filter((m) => m.to[0] === email)).toHaveLength(2);
    await runSequences(gEnv, later(21));
    await runSequences(gEnv, later(21)); // runs twice, sends once
    await runSequences(gEnv, later(42));
    const toThem = mails.filter((m) => m.to[0] === email);
    expect(toThem.map((m) => m.subject)).toEqual(["Confirm to get your 3 free exercises", "Day 1 of 3: the short foot", "Day 2 of 3: toe yoga", "Day 3 of 3: single-leg balance"]);
    expect(toThem[3].text).toContain("/programmes/lower-body-regeneration");
    expect(toThem[1].text).not.toContain("See the full programme");
    await runSequences(gEnv, later(80));
    expect(mails.filter((m) => m.to[0] === email)).toHaveLength(4);
  });

  it("stops if they unsubscribe", async () => {
    const email = uniq("stop");
    const c = new TestClient(gEnv);
    await c.post("/subscribe", { email, source: "taster" });
    await c.get(`/subscribe/confirm?token=${linkIn(mails[0], "/subscribe/confirm")}`);
    const unsub = /\/unsubscribe\?e=[^\s"]+/.exec(mails[1].text)![0];
    await app.request(unsub, { method: "POST" }, gEnv);
    await runSequences(gEnv, new Date(Date.now() + 30 * 3_600_000));
    expect(mails.filter((m) => m.to[0] === email)).toHaveLength(2);
  });
});

describe("marketing feed", () => {
  it("lists public pages to market", async () => {
    const res = await app.request("/marketing-feed.json", {}, gEnv);
    const feed = (await res.json()) as { items: { name: string; url: string; description: string }[] };
    expect(feed.items.find((i) => i.url.endsWith("/programmes/lower-body-regeneration"))).toBeTruthy();
    expect(feed.items.find((i) => i.url.endsWith("/taster"))).toBeTruthy();
    expect(feed.items.every((i) => i.name && i.url && i.description)).toBe(true);
  });
});
