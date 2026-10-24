import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { saveAffiliateSettings } from "../src/services/affiliates";
import { parseTestimonials } from "../src/services/site-content";
import { signWebhook } from "../src/services/payments/stripe";
import { hashPassword } from "../src/lib/crypto";
import { productId, putOnSale, TestClient } from "./helpers";

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const mailEnv = { ...env, RESEND_API_KEY: "re_test", ADMIN_ENC_KEY: KEY } as Env;
let sent: any[] = [];
let seq = 0;
const uniq = (p: string) => `${p}${++seq}-${Date.now()}@example.com`;
const setSetting = (k: string, v: string) => env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(k, v).run();

beforeEach(async () => {
  sent = [];
  await env.DB.prepare("DELETE FROM settings").run();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.includes("resend.com")) {
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "em_1" });
    }
    if (u.includes("stripe.com")) {
      sent.push({ stripe: new URLSearchParams(String(init?.body)) });
      return Response.json({ id: `cs_${crypto.randomUUID()}`, url: "https://checkout.stripe.com/x" });
    }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const linkIn = (email: any, path: string) => new RegExp(`${path}\\?token=([0-9a-f]+)`).exec(email.text)?.[1];

describe("email sign-up (double opt-in)", () => {
  it("asks people to confirm, then records consent and sends the welcome email", async () => {
    const email = uniq("sub");
    const c = new TestClient(mailEnv);
    const res = await c.post("/subscribe", { email, source: "home" });
    expect(await res.text()).toContain("Check your inbox");
    expect(sent[0].subject).toBe("Please confirm your email");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM consents WHERE email = ?1").bind(email).first("n")).toBe(0); // not until confirmed

    const token = linkIn(sent[0], "/subscribe/confirm");
    const ok = await c.get(`/subscribe/confirm?token=${token}`);
    expect(await ok.text()).toContain("You&#39;re in");
    const consent = await env.DB.prepare("SELECT granted, source FROM consents WHERE email = ?1 ORDER BY id DESC LIMIT 1").bind(email).first<any>();
    expect(consent).toEqual({ granted: 1, source: "signup:home" });
    expect(sent[1].subject).toBe("Welcome to The Body Regeneration Method");
    expect(sent[1].html).toContain("/unsubscribe?e=");
    expect((await c.get(`/subscribe/confirm?token=${token}`)).status).toBe(400); // link works once
  });

  it("includes the owner's offer code in the welcome email and on the page", async () => {
    await setSetting("offer.headline", "Test offer headline");
    await setSetting("offer.code", "TESTCODE");
    const home = await (await app.request("/", {}, env)).text();
    expect(home).toContain("Test offer headline");
    const email = uniq("offer");
    const c = new TestClient(mailEnv);
    await c.post("/subscribe", { email, source: "popup" });
    await c.get(`/subscribe/confirm?token=${linkIn(sent[0], "/subscribe/confirm")}`);
    expect(sent[1].html).toContain("TESTCODE");
    expect(sent[1].subject).toBe("Welcome: Test offer headline");
  });

  it("ignores bots that fill in the hidden field", async () => {
    const email = uniq("bot");
    await new TestClient(mailEnv).post("/subscribe", { email, website: "spam.example" });
    expect(sent).toHaveLength(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM subscribers WHERE email = ?1").bind(email).first("n")).toBe(0);
  });

  it("doesn't email people already subscribed, but says the same thing", async () => {
    const email = uniq("dup");
    await env.DB.prepare("INSERT INTO consents (email, kind, granted, wording_version, source) VALUES (?1, 'marketing_email', 1, 'v', 't')").bind(email).run();
    const res = await new TestClient(mailEnv).post("/subscribe", { email });
    expect(await res.text()).toContain("Check your inbox");
    expect(sent).toHaveLength(0);
  });

  it("rejects bad addresses", async () => {
    expect((await new TestClient(mailEnv).post("/subscribe", { email: "nope" })).status).toBe(422);
  });
});

describe("pop-up and conversion sections", () => {
  it("adds the pop-up and its script to marketing pages only, for visitors", async () => {
    const home = await (await app.request("/", {}, env)).text();
    expect(home).toContain('id="signup-dialog"');
    expect(home).toMatch(/<script src="\/app\.js\?v=[a-z0-9]+" defer=""><\/script>/);
    for (const p of ["/basket", "/legal/terms", "/login"]) {
      expect(await (await app.request(p, {}, env)).text(), p).not.toContain("signup-dialog");
    }
    const js = await app.request("/app.js", {}, env);
    expect(js.headers.get("Content-Type")).toContain("javascript");
    expect(await js.text()).toContain("showModal");
  });

  it("hides the pop-up from logged-in members", async () => {
    const email = uniq("mem");
    await env.DB.prepare("INSERT INTO users (email, password_hash) VALUES (?1, ?2)").bind(email, await hashPassword("long enough password")).run();
    const c = new TestClient(env);
    await c.post("/login", { email, password: "long enough password" });
    expect(await (await c.get("/")).text()).not.toContain("signup-dialog");
  });

  it("shows testimonials only once real ones are added", async () => {
    expect(await (await app.request("/", {}, env)).text()).not.toContain("What people say");
    await setSetting("testimonials", "It changed how I walk.\n- Sam, Belfast\n\nBrilliant.\n- Jo, Leeds");
    const html = await (await app.request("/", {}, env)).text();
    expect(html).toContain("What people say");
    expect(html).toContain("Sam, Belfast");
    expect(parseTestimonials("No author line here")).toEqual([]);
  });

  it("flagship page has 'Is this you?', how it works, FAQs and a phone buy bar", async () => {
    const html = await (await app.request("/programmes/lower-body-regeneration", {}, env)).text();
    expect(html).toContain("Is this you?");
    expect(html).toContain("Start with the full guide");
    expect(html).toContain('class="sticky-buy"');
    expect(html).toContain("All questions →");
  });

  it("adds price details to search results data when on sale", async () => {
    await putOnSale(env.DB, "lower-body-regeneration", 4900);
    const html = await (await app.request("/programmes/lower-body-regeneration", {}, env)).text();
    expect(html).toContain('"price":"49.00","priceCurrency":"GBP"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    await env.DB.prepare("UPDATE products SET status = 'draft', price_pence = NULL").run();
  });
});

describe("guides and SEO", () => {
  it("lists the guides and serves each with Article data", async () => {
    const index = await (await app.request("/guides", {}, env)).text();
    expect(index.match(/class="card guide-card"/g)).toHaveLength(3);
    const g = await (await app.request("/guides/why-your-feet-matter", {}, env)).text();
    expect(g).toContain('"@type":"Article"');
    expect(g).toContain('<meta property="og:type" content="article"/>');
    expect(g).toContain('<h2 class="rt-h2">');
    expect(g).toContain('href="/programmes/lower-body-regeneration"');
    expect((await app.request("/guides/nope", {}, env)).status).toBe(404);
  });

  it("puts the guides in the sitemap", async () => {
    const xml = await (await app.request("/sitemap.xml", {}, env)).text();
    expect(xml).toContain("/guides/six-principles</loc>");
  });

  it("serves the social share image and links it from every page", async () => {
    const img = await app.request("/og.png", {}, env);
    expect(img.headers.get("Content-Type")).toBe("image/png");
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
    expect(await (await app.request("/", {}, env)).text()).toContain('<meta name="twitter:card" content="summary_large_image"/>');
  });

  it("guides avoid medical-cure wording", async () => {
    for (const slug of ["why-your-feet-matter", "tension-and-gripping", "six-principles"]) {
      const text = (await (await app.request(`/guides/${slug}`, {}, env)).text()).toLowerCase();
      for (const word of ["cure", "heals ", "guaranteed", "fix your pain", "treats "]) expect(text, `${slug}: ${word}`).not.toContain(word);
    }
  });
});

describe("discount codes", () => {
  const WHSEC = "whsec_disc";
  const shopEnv = { ...env, STRIPE_SECRET_KEY: "sk_test_d", STRIPE_WEBHOOK_SECRET: WHSEC } as Env;

  async function checkoutAndPay(sessionOverrides: object, ref?: string) {
    await putOnSale(env.DB, "lower-body-regeneration", 5000);
    const c = new TestClient(shopEnv);
    await c.post("/basket/add", { slug: "lower-body-regeneration" });
    await c.post("/checkout", { health_declaration: "yes", terms: "yes", immediate_access: "yes", ...(ref ? { ref } : {}) });
    const order = await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<any>();
    const payload = JSON.stringify({
      id: `evt_${order.public_id}`,
      type: "checkout.session.completed",
      data: { object: { id: order.stripe_session_id, client_reference_id: order.public_id, payment_status: "paid", currency: "gbp", payment_intent: `pi_${order.public_id}`, customer_details: { email: uniq("disc") }, ...sessionOverrides } },
    });
    await app.request("/webhooks/stripe", { method: "POST", body: payload, headers: { "Stripe-Signature": await signWebhook(WHSEC, payload) } }, shopEnv);
    return env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(order.id).first<any>();
  }

  it("lets customers enter codes at Stripe checkout", async () => {
    await checkoutAndPay({ amount_subtotal: 5000, amount_total: 5000 });
    const stripe = sent.find((s) => s.stripe)!.stripe as URLSearchParams;
    expect(stripe.get("allow_promotion_codes")).toBe("true");
  });

  it("accepts a discounted payment and records what was actually paid", async () => {
    const order = await checkoutAndPay({ amount_subtotal: 5000, amount_total: 4500 });
    expect(order.status).toBe("paid");
    expect(order.amount_paid_pence).toBe(4500);
  });

  it("still refuses payments that don't match the order", async () => {
    expect((await checkoutAndPay({ amount_subtotal: 100, amount_total: 100 })).status).toBe("pending");
    expect((await checkoutAndPay({ amount_subtotal: 5000, amount_total: 9000 })).status).toBe("pending");
  });

  it("pays affiliate commission on the discounted amount", async () => {
    await saveAffiliateSettings(env.DB, { rate: "20", holdDays: "30", minPayout: "10" }, { userId: 1 });
    const email = uniq("aff");
    const uid = await env.DB.prepare("INSERT INTO users (email, password_hash) VALUES (?1, 'x') RETURNING id").bind(email).first<number>("id");
    await env.DB.prepare("INSERT INTO affiliates (user_id, code, terms_version) VALUES (?1, 'disc2345', 'v')").bind(uid).run();
    const order = await checkoutAndPay({ amount_subtotal: 5000, amount_total: 4000 }, "disc2345");
    expect(await env.DB.prepare("SELECT amount_pence FROM commissions WHERE order_id = ?1").bind(order.id).first("amount_pence")).toBe(800);
    expect(await productId(env.DB, "hips")).toBeGreaterThan(0);
  });
});
