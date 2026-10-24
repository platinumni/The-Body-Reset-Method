import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { hashPassword } from "../src/lib/crypto";
import { currentStep, totpAt, verifyTotp, base32Decode, base32Encode } from "../src/lib/totp";
import { decryptText, encryptText } from "../src/lib/encryption";
import { parseFaqText } from "../src/services/site-content";
import { toCsv } from "../src/services/admin-ops";
import { productId, putOnSale, TestClient } from "./helpers";

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const adminEnv = { ...env, ADMIN_ENC_KEY: KEY, STRIPE_SECRET_KEY: "sk_test_admin" } as Env;
const PW = "admin password long enough";
let seq = 0;

async function makeAdmin() {
  const email = `admin${++seq}-${Date.now()}@example.com`;
  await env.DB.prepare("INSERT INTO users (email, password_hash, role) VALUES (?1, ?2, 'admin')").bind(email, await hashPassword(PW)).run();
  return email;
}

/** Log in as a brand-new admin: password → enrol authenticator → session. Returns the client and secret. */
async function adminClient() {
  const email = await makeAdmin();
  const c = new TestClient(adminEnv);
  await c.get("/admin/login");
  const r1 = await c.post("/admin/login", { email, password: PW });
  expect(r1.headers.get("Location")).toBe("/admin/login/enrol");
  const page = await (await c.get("/admin/login/enrol")).text();
  const secret = /name="secret" value="([A-Z2-7]+)"/.exec(page)![1]!;
  const res = await c.post("/admin/login/enrol", { secret, code: await totpAt(secret, currentStep()) });
  expect(res.status).toBe(200);
  const codes = [...(await res.text()).matchAll(/<code>([a-f0-9]{5}-[a-f0-9]{5})<\/code>/g)].map((m) => m[1]!);
  return { c, email, secret, codes };
}

let admin: Awaited<ReturnType<typeof adminClient>>;
beforeAll(async () => {
  admin = await adminClient();
});
afterEach(() => vi.restoreAllMocks());

describe("authenticator codes (TOTP)", () => {
  it("matches the RFC 6238 test vector", async () => {
    // RFC secret "12345678901234567890", T=59s → 287082 (last 6 digits of 94287082)
    const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
    expect(await totpAt(secret, 1)).toBe("287082");
    expect(base32Decode(secret)).toEqual(new TextEncoder().encode("12345678901234567890"));
  });

  it("accepts codes within ~30s of drift only", async () => {
    const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
    const now = Date.now();
    expect(await verifyTotp(secret, await totpAt(secret, currentStep(now) - 1), now)).not.toBeNull();
    expect(await verifyTotp(secret, await totpAt(secret, currentStep(now) - 3), now)).toBeNull();
    expect(await verifyTotp(secret, "abc", now)).toBeNull();
  });

  it("encrypts secrets at rest", async () => {
    const enc = await encryptText(KEY, "SECRET");
    expect(enc).not.toContain("SECRET");
    expect(await decryptText(KEY, enc)).toBe("SECRET");
  });
});

describe("admin login", () => {
  it("first login sets up the authenticator and shows 10 backup codes", async () => {
    expect(admin.codes).toHaveLength(10);
    expect((await admin.c.get("/admin")).status).toBe(200);
    const stored = await env.DB.prepare("SELECT secret_encrypted FROM admin_mfa m JOIN users u ON u.id = m.user_id WHERE u.email = ?1").bind(admin.email).first<string>("secret_encrypted");
    expect(stored).not.toContain(admin.secret);
  });

  it("keeps the admin area hidden from everyone else", async () => {
    expect((await app.request("/admin", {}, adminEnv)).headers.get("Location")).toBe("/admin/login");
    expect((await app.request("/admin/orders", { method: "POST" }, adminEnv)).status).toBe(403); // no CSRF token even
    // A normal member session can't see admin…
    const member = `m${++seq}@example.com`;
    await env.DB.prepare("INSERT INTO users (email, password_hash) VALUES (?1, ?2)").bind(member, await hashPassword(PW)).run();
    const m = new TestClient(adminEnv);
    await m.post("/login", { email: member, password: PW });
    expect((await m.get("/admin/programmes")).status).toBe(404);
    // …even if that person is later made an admin, until they pass the two-step check.
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?1").bind(member).run();
    expect((await m.get("/admin/programmes")).status).toBe(404);
  });

  it("rejects wrong passwords and non-admin accounts with the same message", async () => {
    const c = new TestClient(adminEnv);
    expect((await c.post("/admin/login", { email: admin.email, password: "wrong wrong wrong" })).status).toBe(401);
    expect((await c.post("/admin/login", { email: "nobody@example.com", password: PW })).status).toBe(401);
  });

  it("second login asks for the code; a code can't be used twice", async () => {
    const c = new TestClient(adminEnv);
    await c.post("/admin/login", { email: admin.email, password: PW });
    expect(await (await c.get("/admin/login/verify")).text()).toContain("6-digit code");
    // The enrolment code (current step) was already used: it must be refused.
    const reused = await c.post("/admin/login/verify", { code: await totpAt(admin.secret, currentStep()) });
    expect(reused.status).toBe(401);
    const next = await c.post("/admin/login/verify", { code: await totpAt(admin.secret, currentStep() + 1) });
    expect(next.headers.get("Location")).toBe("/admin");
    expect((await c.get("/admin")).status).toBe(200);
  });

  it("backup codes work once each", async () => {
    const login = async (backup: string) => {
      const c = new TestClient(adminEnv);
      await c.post("/admin/login", { email: admin.email, password: PW });
      return c.post("/admin/login/verify", { backup });
    };
    expect((await login(admin.codes[0]!)).status).toBe(303);
    expect((await login(admin.codes[0]!)).status).toBe(401);
  });

  it("allows only 5 code attempts per password entry", async () => {
    const c = new TestClient(adminEnv);
    await c.post("/admin/login", { email: admin.email, password: PW });
    for (let i = 0; i < 5; i++) await c.post("/admin/login/verify", { code: "000000" });
    expect((await c.post("/admin/login/verify", { code: await totpAt(admin.secret, currentStep() + 1) })).headers.get("Location")).toBe("/admin/login");
  });

  it("admin sessions last 12 hours", async () => {
    const row = await env.DB.prepare("SELECT (julianday(s.expires_at) - julianday(s.created_at)) * 24 AS hours FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ?1 AND s.mfa_verified = 1 ORDER BY s.id DESC LIMIT 1").bind(admin.email).first<number>("hours");
    expect(Math.round(row!)).toBe(12);
  });

  it("logs admin logins", async () => {
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('admin.login', 'admin.mfa_enabled', 'admin.login_backup_code')").first<number>("n")).toBeGreaterThanOrEqual(2);
  });
});

describe("programmes and prices", () => {
  it("won't put a programme on sale without a price", async () => {
    const id = await productId(env.DB, "hips");
    const res = await admin.c.post(`/admin/programmes/${id}`, { title: "Hips", price: "", status: "on_sale", sort_order: "3" });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Set a price before putting it on sale");
  });

  it("sets a price, shows it in the shop, keeps history and can undo", async () => {
    const id = await productId(env.DB, "full-body");
    await admin.c.post(`/admin/programmes/${id}`, { title: "Full Body", price: "£79.00", status: "on_sale", sort_order: "5" });
    expect(await env.DB.prepare("SELECT price_pence FROM products WHERE id = ?1").bind(id).first("price_pence")).toBe(7900);
    const page = await (await admin.c.get(`/admin/programmes/${id}`)).text();
    expect(page).toContain("Earlier versions (1)");
    const rev = /action="\/admin\/programmes\/\d+\/restore\/(\d+)"/.exec(page)![1];
    await admin.c.post(`/admin/programmes/${id}/restore/${rev}`);
    expect(await env.DB.prepare("SELECT status FROM products WHERE id = ?1").bind(id).first("status")).toBe("draft");
    expect(await env.DB.prepare("SELECT action FROM audit_log WHERE target_type = 'product' AND target_id = ?1 ORDER BY id DESC LIMIT 1").bind(String(id)).first("action")).toBe("product.update");
  });

  it("creates a bundle and chooses its programmes", async () => {
    const res = await admin.c.post("/admin/programmes", { title: "Complete Set", kind: "bundle" });
    const id = Number(/\/admin\/programmes\/(\d+)/.exec(res.headers.get("Location")!)![1]);
    const lower = await productId(env.DB, "lower-body-regeneration");
    const hips = await productId(env.DB, "hips");
    const body = new URLSearchParams([["_csrf", admin.c.csrf], ["items", String(lower)], ["items", String(hips)]]);
    await app.request(`/admin/programmes/${id}/bundle`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: [...admin.c.cookies].map(([k, v]) => `${k}=${v}`).join("; "), "CF-Connecting-IP": admin.c.ip } }, adminEnv);
    const items = await env.DB.prepare("SELECT product_id FROM bundle_items WHERE bundle_id = ?1 ORDER BY product_id").bind(id).all<{ product_id: number }>();
    expect(items.results.map((r) => r.product_id)).toEqual([lower, hips].sort((a, b) => a - b));
  });

  it("duplicates a programme with its lessons as drafts", async () => {
    const res = await admin.c.post(`/admin/programmes/${await productId(env.DB, "lower-body-regeneration")}/duplicate`);
    const id = Number(/\/admin\/programmes\/(\d+)/.exec(res.headers.get("Location")!)![1]);
    expect(await env.DB.prepare("SELECT status FROM products WHERE id = ?1").bind(id).first("status")).toBe("draft");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM programme_lessons WHERE product_id = ?1 AND status = 'published'").bind(id).first("n")).toBe(0);
  });
});

describe("lesson editor", () => {
  const pidP = () => productId(env.DB, "breathwork-regulation");

  async function createLesson(fields: Record<string, string>) {
    const res = await admin.c.post(`/admin/lessons/new?product=${await pidP()}`, { tab: "full", status: "published", title: "Breath basics", body: "Text", video: "", image_alt: "", ...fields });
    return { res, id: Number(/\/admin\/lessons\/(\d+)/.exec(res.headers.get("Location") ?? "")?.[1]) };
  }

  it("creates a section from a YouTube share link", async () => {
    const { id } = await createLesson({ video: "https://youtu.be/dQw4w9WgXcQ?si=abc" });
    expect(await env.DB.prepare("SELECT youtube_id FROM programme_lessons WHERE id = ?1").bind(id).first("youtube_id")).toBe("dQw4w9WgXcQ");
  });

  it("rejects links that aren't YouTube", async () => {
    const { res } = await createLesson({ video: "https://vimeo.com/123" });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("doesn&#39;t look like a YouTube link");
  });

  it("saves edits with history and restores an earlier version", async () => {
    const { id } = await createLesson({ title: "Version one", body: "first" });
    await admin.c.post(`/admin/lessons/${id}`, { tab: "full", status: "published", title: "Version two", body: "second", video: "", image_alt: "" });
    const page = await (await admin.c.get(`/admin/lessons/${id}`)).text();
    expect(page).toContain("Version two");
    const rev = /\/admin\/lessons\/\d+\/restore\/(\d+)/.exec(page)![1];
    await admin.c.post(`/admin/lessons/${id}/restore/${rev}`);
    expect(await env.DB.prepare("SELECT title FROM programme_lessons WHERE id = ?1").bind(id).first("title")).toBe("Version one");
  });

  it("reorders sections", async () => {
    const a = (await createLesson({ title: "Order A" })).id;
    const b = (await createLesson({ title: "Order B" })).id;
    await admin.c.post(`/admin/lessons/${b}/move`, { direction: "up" });
    const pos = async (id: number) => env.DB.prepare("SELECT position FROM programme_lessons WHERE id = ?1").bind(id).first<number>("position");
    expect((await pos(b))!).toBeLessThan((await pos(a))!);
  });

  it("uploads real images and refuses fake ones", async () => {
    const id = (await createLesson({ title: "With picture" })).id;
    const send = (bytes: Uint8Array, type: string) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries({ _csrf: admin.c.csrf, tab: "full", status: "published", title: "With picture", body: "", video: "", image_alt: "Feet" })) fd.append(k, v);
      fd.append("image", new File([bytes], "pic", { type }));
      return app.request(`/admin/lessons/${id}`, { method: "POST", body: fd, headers: { Cookie: [...admin.c.cookies].map(([k, v]) => `${k}=${v}`).join("; "), "CF-Connecting-IP": admin.c.ip } }, adminEnv);
    };
    const fake = await send(new TextEncoder().encode("<script>not an image</script>"), "image/png");
    expect(fake.status).toBe(422);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect((await send(png, "image/png")).status).toBe(303);
    const key = await env.DB.prepare("SELECT image_key FROM programme_lessons WHERE id = ?1").bind(id).first<string>("image_key");
    expect(key).toMatch(/^lessons\/[0-9a-f-]+\.png$/);
    expect(await env.MEDIA.get(key!)).not.toBeNull();
    expect((await admin.c.get(`/media/${key}`)).status).toBe(200); // admins can preview
  });
});

describe("orders and customers", () => {
  it("gives free access, which the person can then use", async () => {
    const email = `gift${++seq}@example.com`;
    const res = await admin.c.post("/admin/access", { email, product: String(await productId(env.DB, "hips")) });
    expect(res.headers.get("Location")).toMatch(/^\/admin\/orders\/GIFT-/);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM entitlements WHERE email = ?1 AND revoked_at IS NULL").bind(email).first("n")).toBe(1);
    expect(await env.DB.prepare("SELECT template FROM email_log WHERE to_email = ?1").bind(email).first("template")).toBe("access_granted");
    // Remove it again
    const ref = res.headers.get("Location")!.split("/").pop()!.split("?")[0];
    await admin.c.post(`/admin/orders/${ref}/revoke`, { confirm: "yes" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM entitlements WHERE email = ?1 AND revoked_at IS NULL").bind(email).first("n")).toBe(0);
  });

  it("refunds through Stripe only after the confirm tick", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${String(input)} ${String(init?.body)}`);
      return Response.json({ id: "re_1" });
    });
    await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json, stripe_payment_intent) VALUES ('REF-TEST', 'r@example.com', 'paid', 4900, '{}', 'pi_refund_me')").run();
    await admin.c.post("/admin/orders/REF-TEST/refund", {});
    expect(calls).toHaveLength(0);
    const res = await admin.c.post("/admin/orders/REF-TEST/refund", { confirm: "yes" });
    expect(res.headers.get("Location")).toContain("done=refund");
    expect(calls[0]).toContain("https://api.stripe.com/v1/refunds");
    expect(calls[0]).toContain("payment_intent=pi_refund_me");
  });

  it("lists customers and exports a safe CSV", async () => {
    await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json) VALUES ('CSV-1', '=cmd@example.com', 'paid', 100, '{}')").run();
    expect(await (await admin.c.get("/admin/customers")).text()).toContain("=cmd@example.com");
    const csv = await (await admin.c.get("/admin/customers.csv")).text();
    expect(csv.split("\r\n")[0]).toBe("email,name,has_account,programmes,spent,first_seen");
    expect(csv).toContain("'=cmd@example.com");
    expect(toCsv([{ a: 'x,"y"' }], ["a"])).toBe('a\r\n"x,""y"""\r\n');
  });

  it("shows orders with search", async () => {
    const html = await (await admin.c.get("/admin/orders?q=CSV-1")).text();
    expect(html).toContain("CSV-1");
  });
});

describe("site wording", () => {
  it("edits the homepage headline and FAQs, keeping history", async () => {
    await admin.c.post("/admin/wording", { "home.headline": "Line one.\nLine two.\nLine three.", faqs: "Q: Custom question?\nA: Custom answer." });
    const home = await (await app.request("/", {}, env)).text();
    expect(home).toContain("Line one.");
    const faq = await (await app.request("/faq", {}, env)).text();
    expect(faq).toContain("Custom question?");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM revisions WHERE entity_type = 'setting' AND entity_id = 'home.headline'").first("n")).toBe(1);
    // Put the defaults back for other tests.
    await env.DB.prepare("DELETE FROM settings").run();
  });

  it("parses the FAQ text format", () => {
    expect(parseFaqText("Q: One?\nA: First\nline.\n\nQ: Two?\nA: Second.\n\nnonsense")).toEqual([
      { q: "One?", a: ["First line."] },
      { q: "Two?", a: ["Second."] },
    ]);
  });

  it("keeps unconfirmed placeholders highlighted after an edit", async () => {
    await admin.c.post("/admin/wording", { "coach.story": "My story. [PLACEHOLDER: more to come]" });
    expect(await (await app.request("/about", {}, env)).text()).toContain('<mark class="placeholder" data-placeholder="true">[PLACEHOLDER: more to come]</mark>');
    await env.DB.prepare("DELETE FROM settings").run();
  });
});

describe("system pages", () => {
  it("backs up on request", async () => {
    const res = await admin.c.post("/admin/backups");
    expect(res.headers.get("Location")).toContain("done=backup");
    expect(await (await admin.c.get("/admin/backups")).text()).toContain("manual");
  });

  it("counts anonymous public page views, but not bots or admin", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const count = () => env.DB.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM daily_stats WHERE day = ?1 AND metric = 'view' AND path = '/method'").bind(day).first<number>("n");
    const before = (await count())!;
    await app.request("/method", { headers: { "User-Agent": "Mozilla/5.0 (iPhone)" } }, env);
    await app.request("/method", { headers: { "User-Agent": "Googlebot/2.1" } }, env);
    await admin.c.get("/method");
    expect(await count()).toBe(before + 1);
    expect(await (await admin.c.get("/admin/stats")).text()).toContain("/method");
  });

  it("shows the dashboard, activity and email pages", async () => {
    for (const p of ["/admin", "/admin/activity", "/admin/emails", "/admin/programmes", "/admin/wording"]) {
      const res = await admin.c.get(p);
      expect(res.status, p).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});

describe("launch checklist", () => {
  it("lists missing keys and the placeholders left on public pages", async () => {
    const html = await (await admin.c.get("/admin/launch")).text();
    expect(html).toContain("Stripe webhook secret is set");
    expect(html).toContain("Site address is the real domain");
    expect(html).toContain("Flagship price");
    expect(html).toContain("/legal/terms");
  });
});

describe("contact messages", () => {
  it("shows contact form messages to the admin and marks them handled", async () => {
    const email = `msg-${Date.now()}@example.com`;
    const id = await env.DB.prepare("INSERT INTO contact_messages (name, email, message) VALUES ('Alex', ?1, 'Is there a guarantee?') RETURNING id").bind(email).first<number>("id");
    const html = await (await admin.c.get("/admin/messages")).text();
    expect(html).toContain("Is there a guarantee?");
    expect(html).toContain(email);
    expect((await admin.c.post(`/admin/messages/${id}/handled`, {})).status).toBe(303);
    expect(await env.DB.prepare("SELECT handled_at IS NOT NULL AS h FROM contact_messages WHERE id = ?1").bind(id).first("h")).toBe(1);
  });
});
