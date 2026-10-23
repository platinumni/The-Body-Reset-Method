import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, DAILY_CRON, scheduled } from "../src/index";
import { hashPassword } from "../src/lib/crypto";
import { createCommissionForOrder, recordPayout, saveAffiliateSettings } from "../src/services/affiliates";
import { signWebhook } from "../src/services/payments/stripe";
import { productId, putOnSale, TestClient } from "./helpers";

const WHSEC = "whsec_aff";
const shopEnv = { ...env, STRIPE_SECRET_KEY: "sk_test_aff", STRIPE_WEBHOOK_SECRET: WHSEC } as Env;
const PW = "a long enough password";
const ACTOR = { userId: 1 };
let seq = 0;

async function setRate(rate: string, hold = "30", min = "10") {
  expect(await saveAffiliateSettings(env.DB, { rate, holdDays: hold, minPayout: min }, ACTOR)).toBeNull();
}

/** A logged-in member who owns the flagship. */
async function member() {
  const email = `aff${++seq}-${Date.now()}@example.com`;
  const uid = await env.DB.prepare("INSERT INTO users (email, password_hash) VALUES (?1, ?2) RETURNING id").bind(email, await hashPassword(PW)).first<number>("id");
  const order = await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json) VALUES (?1, ?2, 'paid', 100, '{}') RETURNING id").bind(`O-${crypto.randomUUID()}`, email).first<number>("id");
  await env.DB.prepare("INSERT INTO entitlements (email, user_id, product_id, order_id) VALUES (?1, ?2, ?3, ?4)").bind(email, uid, await productId(env.DB, "lower-body-regeneration"), order).run();
  const client = new TestClient(shopEnv);
  await client.post("/login", { email, password: PW });
  return { client, email, uid: uid! };
}

async function affiliate() {
  const m = await member();
  await m.client.post("/account/affiliate/join", { terms: "yes" });
  const code = await env.DB.prepare("SELECT code FROM affiliates WHERE user_id = ?1").bind(m.uid).first<string>("code");
  return { ...m, code: code!, affId: (await env.DB.prepare("SELECT id FROM affiliates WHERE user_id = ?1").bind(m.uid).first<number>("id"))! };
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM settings").run();
  await putOnSale(env.DB, "lower-body-regeneration", 5000);
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ id: `cs_${crypto.randomUUID()}`, url: "https://checkout.stripe.com/x" }));
});
afterEach(() => vi.restoreAllMocks());

async function buy(client: TestClient, fields: Record<string, string> = {}) {
  await client.post("/basket/add", { slug: "lower-body-regeneration" });
  await client.post("/checkout", { health_declaration: "yes", terms: "yes", immediate_access: "yes", ...fields });
  return env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<any>();
}

async function pay(order: any, email = `buyer-${order.public_id}@example.com`) {
  const payload = JSON.stringify({
    id: `evt_${order.public_id}`,
    type: "checkout.session.completed",
    data: { object: { id: order.stripe_session_id, client_reference_id: order.public_id, payment_status: "paid", amount_total: order.total_pence, currency: "gbp", payment_intent: `pi_${order.public_id}`, customer_details: { email } } },
  });
  await app.request("/webhooks/stripe", { method: "POST", body: payload, headers: { "Stripe-Signature": await signWebhook(WHSEC, payload) } }, shopEnv);
}

describe("joining", () => {
  it("stays closed until the owner sets a commission rate", async () => {
    const m = await member();
    expect(await (await m.client.get("/account")).text()).toContain("opening soon");
    await m.client.post("/account/affiliate/join", { terms: "yes" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM affiliates WHERE user_id = ?1").bind(m.uid).first("n")).toBe(0);
  });

  it("needs the terms ticked, then gives a link and records agreement", async () => {
    await setRate("20");
    const m = await member();
    await m.client.post("/account/affiliate/join", {});
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM affiliates WHERE user_id = ?1").bind(m.uid).first("n")).toBe(0);
    await m.client.post("/account/affiliate/join", { terms: "yes" });
    const html = await (await m.client.get("/account")).text();
    expect(html).toMatch(/\/r\/[a-z0-9]{8}/);
    expect(html).toContain("#ad");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM consents WHERE user_id = ?1 AND kind = 'affiliate_terms'").bind(m.uid).first("n")).toBe(1);
  });

  it("validates the owner's settings", async () => {
    expect(await saveAffiliateSettings(env.DB, { rate: "150", holdDays: "30", minPayout: "10" }, ACTOR)).toContain("between 1 and 90");
    expect(await saveAffiliateSettings(env.DB, { rate: "20", holdDays: "-1", minPayout: "10" }, ACTOR)).toContain("Hold period");
  });
});

describe("share links and consent", () => {
  it("counts the visit, then asks before storing a referral cookie", async () => {
    await setRate("20");
    const a = await affiliate();
    const visitor = new TestClient(shopEnv);
    const r = await visitor.get(`/r/${a.code}?to=/programmes/lower-body-regeneration`);
    expect(r.headers.get("Location")).toBe(`/programmes/lower-body-regeneration?ref=${a.code}`);
    expect(visitor.cookies.has("brm_ref")).toBe(false); // nothing stored without consent
    expect(await env.DB.prepare("SELECT SUM(count) AS n FROM affiliate_clicks WHERE affiliate_id = ?1").bind(a.affId).first("n")).toBe(1);

    const page = await (await visitor.get(`/programmes/lower-body-regeneration?ref=${a.code}`)).text();
    expect(page).toContain("A member recommended us to you");
    await visitor.post("/referral", { code: a.code, choice: "no", back: "/" });
    expect(visitor.cookies.has("brm_ref")).toBe(false);
    await visitor.post("/referral", { code: a.code, choice: "yes", back: "/" });
    expect(visitor.cookies.get("brm_ref")).toBe(a.code);
  });

  it("ignores unknown codes and only redirects locally", async () => {
    const res = await app.request("/r/nosuchcode?to=https://evil.example", {}, env);
    expect(res.headers.get("Location")).toBe("/");
  });
});

describe("commission", () => {
  it("earns commission on a referred sale, held for the hold period", async () => {
    await setRate("20", "30");
    const a = await affiliate();
    const buyer = new TestClient(shopEnv);
    await buyer.post("/referral", { code: a.code, choice: "yes", back: "/" });
    const order = await buy(buyer);
    expect(order.ref_code).toBe(a.code);
    await pay(order);
    const c = await env.DB.prepare("SELECT * FROM commissions WHERE order_id = ?1").bind(order.id).first<any>();
    expect(c).toMatchObject({ affiliate_id: a.affId, amount_pence: 1000, status: "pending", rate_percent: 20 });
    const days = (Date.parse(c.available_at) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it("accepts a code typed at checkout, and ignores invalid ones", async () => {
    await setRate("20");
    const a = await affiliate();
    expect((await buy(new TestClient(shopEnv), { ref: a.code.toUpperCase() })).ref_code).toBe(a.code);
    expect((await buy(new TestClient(shopEnv), { ref: "madeup12" })).ref_code).toBeNull();
  });

  it("never pays commission on your own purchase", async () => {
    await setRate("20");
    const a = await affiliate();
    const order = await buy(new TestClient(shopEnv), { ref: a.code });
    await pay(order, a.email);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM commissions WHERE order_id = ?1").bind(order.id).first("n")).toBe(0);
  });

  it("is one level only: a referred buyer's own link doesn't pay the original affiliate", async () => {
    await setRate("20");
    const a = await affiliate();
    const b = await affiliate(); // say b was referred by a; b's sales credit only b
    const order = await buy(new TestClient(shopEnv), { ref: b.code });
    await pay(order);
    const rows = await env.DB.prepare("SELECT affiliate_id FROM commissions WHERE order_id = ?1").bind(order.id).all<any>();
    expect(rows.results.map((r) => r.affiliate_id)).toEqual([b.affId]);
    expect(rows.results.map((r) => r.affiliate_id)).not.toContain(a.affId);
  });

  it("a refund cancels unpaid commission", async () => {
    await setRate("20");
    const a = await affiliate();
    const order = await buy(new TestClient(shopEnv), { ref: a.code });
    await pay(order);
    const payload = JSON.stringify({ id: `evt_ref_${order.id}`, type: "charge.refunded", data: { object: { refunded: true, payment_intent: `pi_${order.public_id}` } } });
    await app.request("/webhooks/stripe", { method: "POST", body: payload, headers: { "Stripe-Signature": await signWebhook(WHSEC, payload) } }, shopEnv);
    expect(await env.DB.prepare("SELECT status FROM commissions WHERE order_id = ?1").bind(order.id).first("status")).toBe("cancelled");
  });

  it("the daily job releases commission after the hold, and payouts mark it paid", async () => {
    await setRate("20", "0", "5");
    const a = await affiliate();
    const order = await buy(new TestClient(shopEnv), { ref: a.code });
    await pay(order);
    await scheduled({ cron: DAILY_CRON, scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env);
    expect(await env.DB.prepare("SELECT status FROM commissions WHERE order_id = ?1").bind(order.id).first("status")).toBe("approved");
    expect(await (await a.client.get("/account")).text()).toContain("£10.00</strong><span>owed to you");
    expect(await recordPayout(env.DB, a.affId, { method: "paypal", reference: "PP-1" }, ACTOR)).toBe(1000);
    expect(await env.DB.prepare("SELECT status FROM commissions WHERE order_id = ?1").bind(order.id).first("status")).toBe("paid");
    expect(await recordPayout(env.DB, a.affId, { method: "paypal", reference: "" }, ACTOR)).toBeNull(); // nothing left
  });

  it("won't create commission while the programme is closed or the link is paused", async () => {
    const a = await (async () => {
      await setRate("20");
      return affiliate();
    })();
    await env.DB.prepare("UPDATE affiliates SET status = 'suspended' WHERE id = ?1").bind(a.affId).run();
    expect(await createCommissionForOrder(env.DB, { id: 999_999, ref_code: a.code, total_pence: 5000 }, "x@example.com")).toBe(false);
    await env.DB.prepare("UPDATE affiliates SET status = 'active' WHERE id = ?1").bind(a.affId).run();
    await setRate("");
    expect(await createCommissionForOrder(env.DB, { id: 999_998, ref_code: a.code, total_pence: 5000 }, "x@example.com")).toBe(false);
  });

  it("includes affiliate data in the member's data download", async () => {
    await setRate("20");
    const a = await affiliate();
    const data = (await (await a.client.get("/account/export")).json()) as any;
    expect(data.affiliate[0].code).toBe(a.code);
  });
});
