import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { weekSeed } from "../src/lib/meal-plans/planner";
import { createEmailToken } from "../src/services/email-tokens";
import { signWebhook } from "../src/services/payments/stripe";
import { TestClient } from "./helpers";

const WHSEC = "whsec_subs";
const PW = "a long enough password";
const sEnv = { ...env, STRIPE_SECRET_KEY: "sk_test_subs", STRIPE_WEBHOOK_SECRET: WHSEC, RESEND_API_KEY: "re_test" } as Env;
let stripe: { url: string; method: string; body: URLSearchParams }[] = [];
let mails: any[] = [];
let seq = 0;
const uniq = (p: string) => `${p}${++seq}-${Date.now()}@example.com`;

beforeEach(async () => {
  stripe = [];
  mails = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const u = String(input);
    if (u.includes("resend.com")) {
      mails.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "em_1" });
    }
    if (u.startsWith("https://api.stripe.com/")) {
      stripe.push({ url: u, method: init?.method ?? "GET", body: new URLSearchParams(String(init?.body ?? "")) });
      return Response.json({ id: `cs_${crypto.randomUUID()}`, url: "https://checkout.stripe.com/x" });
    }
    throw new Error("unexpected fetch " + u);
  });
  await env.DB.prepare("UPDATE products SET status = 'on_sale', price_pence = 999, monthly_pence = 299 WHERE slug = 'meal-plans'").run();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await env.DB.prepare("UPDATE products SET status = 'draft', price_pence = NULL, monthly_pence = NULL WHERE slug = 'meal-plans'").run();
});

const webhook = async (event: object) => {
  const payload = JSON.stringify(event);
  return app.request("/webhooks/stripe", { method: "POST", body: payload, headers: { "Stripe-Signature": await signWebhook(WHSEC, payload) } }, sEnv);
};
const hasKitchen = (email: string) =>
  env.DB.prepare("SELECT COUNT(*) AS n FROM entitlements e JOIN products p ON p.id = e.product_id WHERE e.email = ?1 AND p.slug = 'meal-plans' AND e.revoked_at IS NULL").bind(email).first<number>("n");

/** Join, pay (webhook), and set up an account. */
async function joined() {
  const email = uniq("kitchen");
  const c = new TestClient(sEnv);
  const res = await c.post("/kitchen/join", { terms: "yes", immediate_access: "yes" });
  expect(res.headers.get("Location")).toBe("https://checkout.stripe.com/x");
  const order = await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<any>();
  const subId = `sub_${crypto.randomUUID()}`;
  await webhook({
    id: `evt_${order.public_id}`,
    type: "checkout.session.completed",
    data: { object: { id: order.stripe_session_id, mode: "subscription", subscription: subId, customer: "cus_1", client_reference_id: order.public_id, payment_status: "paid", amount_subtotal: 1298, amount_total: 1298, currency: "gbp", payment_intent: null, customer_details: { email } } },
  });
  const token = await createEmailToken(env.DB, "setup", email, order.id);
  await c.post("/account/setup", { token, password: PW, confirm: PW });
  return { c, email, order, subId };
}

describe("Kitchen membership", () => {
  it("the Kitchen page shows the joining fee and monthly price clearly, and how to cancel", async () => {
    const html = await (await app.request("/kitchen", {}, sEnv)).text();
    expect(html).toContain("£9.99 to join, then £2.99 a month");
    expect(html).toContain("You pay £12.98 today");
    expect(html).toContain("Cancel any time in your account");
    expect(html).toContain('action="/kitchen/join"');
  });

  it("sends people to Stripe as a monthly subscription plus a one-off joining fee", async () => {
    await joined();
    const call = stripe.find((s) => s.url.endsWith("/checkout/sessions"))!;
    expect(call.body.get("mode")).toBe("subscription");
    expect(call.body.get("line_items[0][price_data][unit_amount]")).toBe("299");
    expect(call.body.get("line_items[0][price_data][recurring][interval]")).toBe("month");
    expect(call.body.get("line_items[1][price_data][unit_amount]")).toBe("999");
    expect(call.body.get("line_items[1][price_data][recurring][interval]")).toBeNull();
  });

  it("needs the tick boxes", async () => {
    const res = await new TestClient(sEnv).post("/kitchen/join", { terms: "yes" });
    expect(res.headers.get("Location")).toBe("/kitchen?missing=1#join");
  });

  it("can't be put in the basket", async () => {
    const c = new TestClient(sEnv);
    await c.post("/basket/add", { slug: "meal-plans" });
    expect(await (await c.get("/basket")).text()).not.toContain("Budget Meal Plans</");
  });

  it("first payment gives access and records the membership; monthly payments are recorded as orders", async () => {
    const { email, subId } = await joined();
    expect(await hasKitchen(email)).toBe(1);
    expect(await env.DB.prepare("SELECT status FROM subscriptions WHERE stripe_subscription_id = ?1").bind(subId).first("status")).toBe("active");
    const invoice = { id: `in_${crypto.randomUUID()}`, billing_reason: "subscription_cycle", subscription: subId, amount_paid: 299, currency: "gbp", payment_intent: `pi_${crypto.randomUUID()}` };
    await webhook({ id: `evt_${invoice.id}`, type: "invoice.paid", data: { object: invoice } });
    await webhook({ id: `evt2_${invoice.id}`, type: "invoice.paid", data: { object: invoice } }); // a second delivery changes nothing
    const renewals = await env.DB.prepare("SELECT total_pence, status FROM orders WHERE email = ?1 AND subscription_id IS NOT NULL AND stripe_session_id = ?2").bind(email, invoice.id).all<any>();
    expect(renewals.results).toEqual([{ total_pence: 299, status: "paid" }]);
  });

  it("members cancel from their account: Stripe stops at the period end, they get a confirmation email", async () => {
    const { c, email, subId } = await joined();
    expect(await (await c.get("/account/membership")).text()).toContain("Cancel membership");
    await c.post("/account/membership", { action: "cancel" });
    const call = stripe.find((s) => s.url.endsWith(`/subscriptions/${subId}`))!;
    expect(call.body.get("cancel_at_period_end")).toBe("true");
    expect(mails.some((m) => m.to[0] === email && m.subject === "Your Kitchen membership is cancelled")).toBe(true);
    expect(await (await c.get("/account/membership")).text()).toContain("Cancelled. You won&#39;t be charged again");
    expect(await hasKitchen(email)).toBe(1); // still has access until the period ends
  });

  it("access ends when Stripe ends the membership", async () => {
    const { email, subId } = await joined();
    await webhook({ id: `evt_del_${subId}`, type: "customer.subscription.deleted", data: { object: { id: subId, status: "canceled" } } });
    expect(await hasKitchen(email)).toBe(0);
    expect(await env.DB.prepare("SELECT status FROM subscriptions WHERE stripe_subscription_id = ?1").bind(subId).first("status")).toBe("ended");
  });

  it("members can star favourite recipes", async () => {
    const { c } = await joined();
    await c.get("/account/meal-plans?submitted=yes&budget=40");
    const page = await (await c.get("/account/meal-plans?submitted=yes&budget=40")).text();
    const recipe = /name="recipe" value="(\d+)"/.exec(page)![1]!;
    await c.post("/account/meal-plans/favourite", { recipe, query: "submitted=yes&budget=40" });
    expect(await (await c.get("/account/meal-plans?submitted=yes&budget=40")).text()).toContain("★ Favourite");
  });
});

describe("weekly plans", () => {
  it("changes each week, and is the same all week", () => {
    const mon = new Date("2026-10-26T08:00:00Z");
    expect(weekSeed(new Date("2026-11-01T20:00:00Z"))).toBe(weekSeed(mon));
    expect(weekSeed(new Date("2026-11-02T08:00:00Z"))).toBe(weekSeed(mon) + 1);
  });
});
