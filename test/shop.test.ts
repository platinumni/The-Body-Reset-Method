import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { signWebhook, toForm, verifyWebhook } from "../src/services/payments/stripe";
import { productId, putOnSale, TestClient } from "./helpers";

const WHSEC = "whsec_test_secret";
const shopEnv = { ...env, STRIPE_SECRET_KEY: "sk_test_123", STRIPE_WEBHOOK_SECRET: WHSEC } as Env;
const TICKS = { health_declaration: "yes", terms: "yes", immediate_access: "yes" };

let fetchSpy: ReturnType<typeof vi.spyOn>;
let stripeCalls: { url: string; body: URLSearchParams; headers: Headers }[] = [];

beforeEach(async () => {
  stripeCalls = [];
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.stripe.com/")) {
      stripeCalls.push({ url, body: new URLSearchParams(String(init?.body)), headers: new Headers(init?.headers) });
      return Response.json({ id: `cs_test_${crypto.randomUUID()}`, url: "https://checkout.stripe.com/c/pay/cs_test" });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  await env.DB.prepare("UPDATE products SET status = 'draft', price_pence = NULL").run();
});
afterEach(() => fetchSpy.mockRestore());

async function webhook(event: object, e: Env = shopEnv) {
  const payload = JSON.stringify(event);
  return app.request("/webhooks/stripe", { method: "POST", body: payload, headers: { "Stripe-Signature": await signWebhook(WHSEC, payload), "Content-Type": "application/json" } }, e);
}

async function checkout(slugs = ["lower-body-regeneration"]) {
  const client = new TestClient(shopEnv);
  for (const slug of slugs) await client.post("/basket/add", { slug });
  const res = await client.post("/checkout", TICKS);
  const order = await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<any>();
  return { client, res, order };
}

const paidEvent = (order: any, overrides: object = {}) => ({
  id: `evt_${order.public_id}`,
  type: "checkout.session.completed",
  data: {
    object: {
      id: order.stripe_session_id,
      client_reference_id: order.public_id,
      payment_status: "paid",
      amount_total: order.total_pence,
      currency: "gbp",
      payment_intent: `pi_${order.public_id}`,
      customer_details: { email: `Buyer-${order.public_id}@Example.com`, name: "Sam Buyer", address: { country: "GB" } },
      ...overrides,
    },
  },
});

describe("basket", () => {
  it("won't add a programme that isn't on sale (no price set)", async () => {
    const client = new TestClient(shopEnv);
    await client.post("/basket/add", { slug: "lower-body-regeneration" });
    expect(await (await client.get("/basket")).text()).toContain("Your basket is empty");
  });

  it("adds an on-sale programme and shows the database price", async () => {
    await putOnSale(env.DB, "lower-body-regeneration", 4900);
    const client = new TestClient(shopEnv);
    const page = await (await client.get("/programmes/lower-body-regeneration")).text();
    expect(page).toContain("£49.00");
    expect(page).toContain('action="/basket/add"');
    const res = await client.post("/basket/add", { slug: "lower-body-regeneration" });
    expect(res.status).toBe(303);
    const basket = await (await client.get("/basket")).text();
    expect(basket).toContain("Lower Body Regeneration");
    expect(basket).toContain("£49.00");
    expect(basket).toContain('class="basket-count">1<');
  });

  it("ignores tampered cookies for products not on sale", async () => {
    await putOnSale(env.DB, "lower-body-regeneration", 4900);
    const client = new TestClient(shopEnv);
    client.cookies.set("brm_basket", "upper-body,lower-body-regeneration,<script>");
    const html = await (await client.get("/basket")).text();
    expect(html).toContain("Lower Body Regeneration");
    expect(html).not.toContain("<strong>Upper Body</strong>");
  });

  it("removes items", async () => {
    await putOnSale(env.DB, "lower-body-regeneration", 4900);
    const client = new TestClient(shopEnv);
    await client.post("/basket/add", { slug: "lower-body-regeneration" });
    await client.post("/basket/remove", { slug: "lower-body-regeneration" });
    expect(await (await client.get("/basket")).text()).toContain("Your basket is empty");
  });

  it("suggests add-ons, but not programmes already inside a bundle in the basket", async () => {
    await putOnSale(env.DB, "lower-body-regeneration", 4900);
    await putOnSale(env.DB, "hips", 2900);
    const bundle = await env.DB.prepare("INSERT INTO products (slug, title, kind, price_pence, status) VALUES ('test-bundle', 'Test Bundle', 'bundle', 6900, 'on_sale') RETURNING id").first<number>("id");
    await env.DB.prepare("INSERT INTO bundle_items (bundle_id, product_id) VALUES (?1, ?2)").bind(bundle, await productId(env.DB, "hips")).run();

    const client = new TestClient(shopEnv);
    await client.post("/basket/add", { slug: "lower-body-regeneration" });
    let html = await (await client.get("/basket")).text();
    expect(html).toContain("Add to your order");
    expect(html).toContain("<strong>Hips</strong>");
    expect(html).toContain("<strong>Test Bundle</strong>");

    await client.post("/basket/add", { slug: "test-bundle" });
    html = await (await client.get("/basket")).text();
    expect(html).not.toMatch(/class="addon card"><div><strong>Hips<\/strong>/);
    await env.DB.prepare("UPDATE products SET status = 'archived' WHERE slug = 'test-bundle'").run();
  });
});

describe("checkout", () => {
  beforeEach(() => putOnSale(env.DB, "lower-body-regeneration", 4900));

  it("is rate limited per visitor", async () => {
    const client = new TestClient(shopEnv);
    await client.post("/basket/add", { slug: "lower-body-regeneration" });
    for (let i = 0; i < 10; i++) await client.post("/checkout", {});
    expect((await client.post("/checkout", TICKS)).status).toBe(429);
  });

  it("requires the three tick boxes", async () => {
    const client = new TestClient(shopEnv);
    await client.post("/basket/add", { slug: "lower-body-regeneration" });
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<number>("n");
    const res = await client.post("/checkout", { health_declaration: "yes", terms: "yes" });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Please tick each of the required boxes");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<number>("n")).toBe(before);
    expect(stripeCalls).toHaveLength(0);
  });

  it("says checkout isn't on yet when Stripe isn't configured", async () => {
    const client = new TestClient(env);
    await client.post("/basket/add", { slug: "lower-body-regeneration" });
    expect(await (await client.get("/basket")).text()).toContain("Checkout isn&#39;t switched on yet");
    expect((await client.post("/checkout", TICKS)).status).toBe(503);
  });

  it("creates a pending order and sends the shopper to Stripe with the database price", async () => {
    const { res, order } = await checkout();
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("https://checkout.stripe.com/c/pay/cs_test");
    expect(order).toMatchObject({ status: "pending", total_pence: 4900, currency: "gbp", marketing_opt_in: 0 });
    expect(order.stripe_session_id).toMatch(/^cs_test_/);
    const consents = JSON.parse(order.consents_json);
    expect(consents.health_declaration.given).toBe(true);
    expect(consents.marketing_email.given).toBe(false);

    const call = stripeCalls[0]!;
    expect(call.headers.get("Authorization")).toBe("Bearer sk_test_123");
    expect(call.headers.get("Idempotency-Key")).toBe(`checkout-${order.public_id}`);
    expect(call.body.get("line_items[0][price_data][unit_amount]")).toBe("4900");
    expect(call.body.get("line_items[0][price_data][currency]")).toBe("gbp");
    expect(call.body.get("line_items[0][price_data][product_data][name]")).toBe("Lower Body Regeneration");
    expect(call.body.get("client_reference_id")).toBe(order.public_id);
    expect(call.body.get("success_url")).toContain(`/checkout/complete?order=${order.public_id}`);
  });
});

describe("Stripe webhook", () => {
  beforeEach(() => putOnSale(env.DB, "lower-body-regeneration", 4900));

  it("rejects missing or forged signatures", async () => {
    const r1 = await app.request("/webhooks/stripe", { method: "POST", body: "{}" }, shopEnv);
    expect(r1.status).toBe(400);
    const r2 = await app.request("/webhooks/stripe", { method: "POST", body: "{}", headers: { "Stripe-Signature": await signWebhook("wrong", "{}") } }, shopEnv);
    expect(r2.status).toBe(400);
  });

  it("on payment: marks paid, grants access, records consents, creates a setup link and logs the email", async () => {
    const { order } = await checkout();
    expect((await webhook(paidEvent(order))).status).toBe(200);

    const paid = await env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(order.id).first<any>();
    expect(paid).toMatchObject({ status: "paid", email: `buyer-${order.public_id.toLowerCase()}@example.com`, name: "Sam Buyer", country: "GB", stripe_payment_intent: `pi_${order.public_id}` });

    const ents = await env.DB.prepare("SELECT * FROM entitlements WHERE order_id = ?1").bind(order.id).all<any>();
    expect(ents.results).toHaveLength(1);
    expect(ents.results[0].product_id).toBe(await productId(env.DB, "lower-body-regeneration"));

    const consents = await env.DB.prepare("SELECT kind, granted FROM consents WHERE source = ?1 ORDER BY kind").bind(`checkout:${order.public_id}`).all<any>();
    expect(consents.results).toEqual([
      { kind: "health_declaration", granted: 1 },
      { kind: "immediate_access", granted: 1 },
      { kind: "marketing_email", granted: 0 },
      { kind: "terms", granted: 1 },
    ]);

    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE order_id = ?1 AND purpose = 'setup'").bind(order.id).first("n")).toBe(1);
    const mail = await env.DB.prepare("SELECT * FROM email_log ORDER BY id DESC LIMIT 1").first<any>();
    expect(mail).toMatchObject({ template: "order_confirmation", status: "skipped", to_email: paid.email });
  });

  it("ignores a repeated delivery of the same event", async () => {
    const { order } = await checkout();
    await webhook(paidEvent(order));
    const res = await webhook(paidEvent(order));
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE order_id = ?1").bind(order.id).first("n")).toBe(1);
  });

  it("never grants access if the amount paid doesn't match the order", async () => {
    const { order } = await checkout();
    await webhook(paidEvent(order, { amount_total: 100 }));
    expect(await env.DB.prepare("SELECT status FROM orders WHERE id = ?1").bind(order.id).first("status")).toBe("pending");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM entitlements WHERE order_id = ?1").bind(order.id).first("n")).toBe(0);
  });

  it("waits for slower payment methods to confirm", async () => {
    const { order } = await checkout();
    await webhook(paidEvent(order, { payment_status: "unpaid" }));
    expect(await env.DB.prepare("SELECT status FROM orders WHERE id = ?1").bind(order.id).first("status")).toBe("pending");
    await webhook({ ...paidEvent(order), id: "evt_async_ok", type: "checkout.session.async_payment_succeeded" });
    expect(await env.DB.prepare("SELECT status FROM orders WHERE id = ?1").bind(order.id).first("status")).toBe("paid");
  });

  it("links access to an existing account and skips the setup link", async () => {
    const { order } = await checkout();
    const email = `buyer-${order.public_id.toLowerCase()}@example.com`;
    const userId = await env.DB.prepare("INSERT INTO users (email, password_hash) VALUES (?1, 'x') RETURNING id").bind(email).first<number>("id");
    await webhook(paidEvent(order));
    expect(await env.DB.prepare("SELECT user_id FROM entitlements WHERE order_id = ?1").bind(order.id).first("user_id")).toBe(userId);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE order_id = ?1").bind(order.id).first("n")).toBe(0);
  });

  it("a full refund removes access; a partial refund doesn't", async () => {
    const { order } = await checkout();
    await webhook(paidEvent(order));
    await webhook({ id: `evt_partial_${order.id}`, type: "charge.refunded", data: { object: { refunded: false, payment_intent: `pi_${order.public_id}` } } });
    expect(await env.DB.prepare("SELECT revoked_at FROM entitlements WHERE order_id = ?1").bind(order.id).first("revoked_at")).toBeNull();
    await webhook({ id: `evt_full_${order.id}`, type: "charge.refunded", data: { object: { refunded: true, payment_intent: `pi_${order.public_id}` } } });
    expect(await env.DB.prepare("SELECT status FROM orders WHERE id = ?1").bind(order.id).first("status")).toBe("refunded");
    expect(await env.DB.prepare("SELECT revoked_at FROM entitlements WHERE order_id = ?1").bind(order.id).first("revoked_at")).not.toBeNull();
  });

  it("marks abandoned checkouts as expired", async () => {
    const { order } = await checkout();
    await webhook({ id: `evt_exp_${order.id}`, type: "checkout.session.expired", data: { object: { id: order.stripe_session_id } } });
    expect(await env.DB.prepare("SELECT status FROM orders WHERE id = ?1").bind(order.id).first("status")).toBe("expired");
  });
});

describe("order result page", () => {
  beforeEach(() => putOnSale(env.DB, "lower-body-regeneration", 4900));

  it("shows 'confirming' and refreshes while pending, then 'you're in' once paid, and empties the basket", async () => {
    const { client, order } = await checkout();
    let res = await client.get(`/checkout/complete?order=${order.public_id}`);
    expect(res.headers.get("Refresh")).toBe("4");
    expect(await res.text()).toContain("Confirming your payment");
    await webhook(paidEvent(order));
    res = await client.get(`/checkout/complete?order=${order.public_id}`);
    expect(await res.text()).toContain("Thank you. You&#39;re in.");
    expect(client.cookies.has("brm_basket")).toBe(false);
  });

  it("handles unknown orders", async () => {
    expect(await (await app.request("/checkout/complete?order=nope", {}, env)).text()).toContain("Order not found");
  });
});

describe("Stripe helpers", () => {
  it("encodes nested params the way Stripe expects", () => {
    expect(toForm({ a: 1, b: { c: "x", d: { 0: { e: 2 } } }, skip: null }).toString()).toBe("a=1&b%5Bc%5D=x&b%5Bd%5D%5B0%5D%5Be%5D=2");
  });

  it("rejects old webhook timestamps (replay protection)", async () => {
    const payload = '{"id":"evt_1","type":"x","data":{"object":{}}}';
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(await verifyWebhook(WHSEC, payload, await signWebhook(WHSEC, payload, old))).toBeNull();
    expect(await verifyWebhook(WHSEC, payload, await signWebhook(WHSEC, payload))).not.toBeNull();
  });
});
