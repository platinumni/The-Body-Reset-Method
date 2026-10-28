import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { createEmailToken } from "../src/services/email-tokens";
import { friendJoinPence, rewardFor, settleFriendRewards } from "../src/services/kitchen-friends";
import { signWebhook } from "../src/services/payments/stripe";
import { TestClient } from "./helpers";

const WHSEC = "whsec_friends";
const PW = "a long enough password";
const fEnv = { ...env, STRIPE_SECRET_KEY: "sk_test_friends", STRIPE_WEBHOOK_SECRET: WHSEC, RESEND_API_KEY: "re_test" } as Env;
let stripe: { url: string; body: URLSearchParams }[] = [];
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
      stripe.push({ url: u, body: new URLSearchParams(String(init?.body ?? "")) });
      return Response.json({ id: `cs_${crypto.randomUUID()}`, url: "https://checkout.stripe.com/x" });
    }
    throw new Error("unexpected fetch " + u);
  });
  await env.DB.prepare("UPDATE products SET status = 'on_sale', price_pence = 1999, monthly_pence = 299 WHERE slug = 'meal-plans'").run();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await env.DB.prepare("UPDATE products SET status = 'draft', price_pence = NULL, monthly_pence = NULL WHERE slug = 'meal-plans'").run();
});

const webhook = async (event: object) => {
  const payload = JSON.stringify(event);
  return app.request("/webhooks/stripe", { method: "POST", body: payload, headers: { "Stripe-Signature": await signWebhook(WHSEC, payload) } }, fEnv);
};

/** Stripe confirms the newest order was paid, for this email. */
async function pay(email: string) {
  const order = await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<any>();
  const subId = `sub_${crypto.randomUUID()}`;
  await webhook({
    id: `evt_${order.public_id}`,
    type: "checkout.session.completed",
    data: { object: { id: order.stripe_session_id, mode: "subscription", subscription: subId, customer: "cus_1", client_reference_id: order.public_id, payment_status: "paid", amount_subtotal: order.total_pence, amount_total: order.total_pence, currency: "gbp", payment_intent: `pi_${order.public_id}`, customer_details: { email } } },
  });
  return { order, subId };
}

/** A Kitchen member with an account, and their invite code. */
async function member(name = "Sam Smith") {
  const email = uniq("member");
  const c = new TestClient(fEnv);
  await c.post("/kitchen/join", { terms: "yes", immediate_access: "yes" });
  const { order, subId } = await pay(email);
  const token = await createEmailToken(env.DB, "setup", email, order.id);
  await c.post("/account/setup", { token, password: PW, confirm: PW });
  await env.DB.prepare("UPDATE users SET name = ?1 WHERE email = ?2").bind(name, email).run();
  const page = await (await c.get("/account/membership")).text();
  const code = /\/kitchen\/friend\/([A-Z0-9]+)/.exec(page)![1]!;
  return { c, email, subId, code, page };
}

/** A friend joins with the code, and pays. */
async function friendJoins(code: string, email = uniq("friend")) {
  const res = await new TestClient(fEnv).post("/kitchen/join", { friend: code, email, terms: "yes", immediate_access: "yes" });
  expect(res.headers.get("Location")).toBe("https://checkout.stripe.com/x");
  return { email, ...(await pay(email)) };
}

const ageReferrals = () => env.DB.prepare("UPDATE kitchen_referrals SET created_at = datetime('now', '-15 days') WHERE status = 'pending'").run();

describe("Kitchen refer-a-friend", () => {
  it("half off the joining fee, to the penny; 1 friend = a year, 2 = lifetime", () => {
    expect(friendJoinPence(1999)).toBe(999);
    expect([0, 1, 2, 3].map(rewardFor)).toEqual([null, "year", "lifetime", "lifetime"]);
  });

  it("members see their invite link and what to send", async () => {
    const { page } = await member();
    expect(page).toContain("Share the Kitchen with friends and family");
    expect(page).toContain("join for £9.99 with my invite (normally £19.99)");
    expect(page).toContain("No friends have joined yet.");
  });

  it("the invite says \"A friend\" unless the member chooses to show their first name", async () => {
    const { c, code } = await member("Sam Smith");
    const invite = async () => (await app.request(`/kitchen/friend/${code}`, {}, fEnv)).text();
    expect(await invite()).toContain("A friend invited you to the Kitchen.");
    expect(await invite()).not.toContain("Sam");
    await c.post("/account/membership/friend-name", { show: "yes" });
    const html = await invite();
    expect(html).toContain("Sam invited you to the Kitchen.");
    expect(html).not.toContain("Smith");
    expect(html).toContain("Join for £9.99 with this invite (normally £19.99), then £2.99 a month.");
    expect(html).toContain('name="robots" content="noindex');
  });

  it("a friend pays half the joining fee at checkout, with their email fixed", async () => {
    const { code } = await member();
    const { email } = await friendJoins(code);
    const call = stripe.filter((s) => s.url.endsWith("/checkout/sessions")).at(-1)!;
    expect(call.body.get("line_items[1][price_data][unit_amount]")).toBe("999");
    expect(call.body.get("line_items[0][price_data][unit_amount]")).toBe("299");
    expect(call.body.get("customer_email")).toBe(email);
    expect(await env.DB.prepare("SELECT status FROM kitchen_referrals WHERE friend_email = ?1").bind(email).first("status")).toBe("pending");
  });

  it("the offer is for new members only, and not your own link", async () => {
    const { code, email } = await member();
    const own = await new TestClient(fEnv).post("/kitchen/join", { friend: code, email, terms: "yes", immediate_access: "yes" });
    expect(own.status).toBe(422);
    expect(await own.text()).toContain("for new members only");
    const other = await member();
    const again = await new TestClient(fEnv).post("/kitchen/join", { friend: code, email: other.email, terms: "yes", immediate_access: "yes" });
    expect(again.status).toBe(422);
    expect(stripe.filter((s) => s.url.endsWith("/checkout/sessions") && s.body.get("customer_email"))).toEqual([]);
  });

  it("a bad or ended code goes to the Kitchen page", async () => {
    expect((await app.request("/kitchen/friend/NOPE99", {}, fEnv)).headers.get("Location")).toBe("/kitchen");
  });

  it("counts after 14 days: 1 friend gives a year free, 2 friends give lifetime, each applied in Stripe with an email", async () => {
    const { c, email, code, subId } = await member();
    await friendJoins(code);
    expect(await settleFriendRewards(fEnv)).toContain("0 rewards given"); // not yet: inside the 14 days
    await ageReferrals();
    await settleFriendRewards(fEnv);
    const coupon = stripe.find((s) => s.url.endsWith("/coupons"))!;
    expect(coupon.body.get("id")).toBe("bodyregen-friend-year");
    expect(coupon.body.get("duration_in_months")).toBe("12");
    expect(stripe.find((s) => s.url.endsWith(`/subscriptions/${subId}`))!.body.get("discounts[0][coupon]")).toBe("bodyregen-friend-year");
    expect(mails.some((m) => m.to[0] === email && m.subject.includes("next year of the Kitchen is free"))).toBe(true);
    expect(await (await c.get("/account/membership")).text()).toContain("your next 12 months are free");

    stripe = [];
    await settleFriendRewards(fEnv);
    expect(stripe).toEqual([]); // given once

    await friendJoins(code);
    await ageReferrals();
    await settleFriendRewards(fEnv);
    expect(stripe.find((s) => s.url.endsWith(`/subscriptions/${subId}`))!.body.get("discounts[0][coupon]")).toBe("bodyregen-friend-lifetime");
    expect(await (await c.get("/account/membership")).text()).toContain("free for life");
  });

  it("a friend refunded within the 14 days doesn't count", async () => {
    const { code } = await member();
    const { order } = await friendJoins(code);
    await webhook({ id: `evt_ref_${order.public_id}`, type: "charge.refunded", data: { object: { refunded: true, payment_intent: `pi_${order.public_id}` } } });
    await ageReferrals();
    await settleFriendRewards(fEnv);
    expect(stripe.some((s) => s.url.endsWith("/coupons"))).toBe(false);
    expect(await env.DB.prepare("SELECT status FROM kitchen_referrals WHERE order_id = ?1").bind(order.id).first("status")).toBe("cancelled");
  });

  it("a friend who left before 14 days doesn't count", async () => {
    const { code } = await member();
    const { subId, order } = await friendJoins(code);
    await webhook({ id: `evt_del_${subId}`, type: "customer.subscription.deleted", data: { object: { id: subId, status: "canceled" } } });
    await ageReferrals();
    await settleFriendRewards(fEnv);
    expect(await env.DB.prepare("SELECT status FROM kitchen_referrals WHERE order_id = ?1").bind(order.id).first("status")).toBe("cancelled");
  });

  it("the member's invite data is in their export", async () => {
    const { c } = await member();
    const data = (await (await c.get("/account/export")).json()) as Record<string, unknown>;
    expect(data).toHaveProperty("friendCode");
    expect(data).toHaveProperty("friendReward");
  });
});

describe("Kitchen for organisations", () => {
  it("has a page for partners, in the sitemap, with a pre-filled enquiry", async () => {
    const html = await (await app.request("/kitchen/partners", {}, env)).text();
    expect(html).toContain("Help the people you support eat well on a tight budget.");
    expect(html).toContain("we never share anyone&#39;s details with you");
    expect(html).toContain("PLACEHOLDER");
    expect(await (await app.request("/sitemap.xml", {}, env)).text()).toContain("/kitchen/partners");
    const contact = await (await app.request("/contact?about=partners", {}, env)).text();
    expect(contact).toContain("interested in Body Regeneration Kitchen for our organisation");
  });
});
