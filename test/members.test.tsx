import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { parseBlocks, RichText } from "../src/lib/markdown";
import { youtubeId } from "../src/lib/youtube";
import { safeNext } from "../src/middleware/auth";
import { createEmailToken } from "../src/services/email-tokens";
import { hashPassword } from "../src/lib/crypto";
import { productId, TestClient } from "./helpers";

let seq = 0;
const uniqueEmail = () => `member${++seq}-${Date.now()}@example.com`;
const PW = "a long enough password";

/** A purchase without an account: an order + entitlement + setup link, as the webhook makes. */
async function purchase(email: string, slug = "lower-body-regeneration") {
  const pid = await productId(env.DB, slug);
  const order = await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json) VALUES (?1, ?2, 'paid', 100, '{}') RETURNING id")
    .bind(`T-${crypto.randomUUID()}`, email)
    .first<number>("id");
  await env.DB.prepare("INSERT INTO entitlements (email, product_id, order_id) VALUES (?1, ?2, ?3)").bind(email, pid, order).run();
  return { orderId: order!, token: await createEmailToken(env.DB, "setup", email, order), productId: pid };
}

async function member(slug = "lower-body-regeneration") {
  const email = uniqueEmail();
  const p = await purchase(email, slug);
  const client = new TestClient(env);
  await client.get(`/account/setup?token=${p.token}`);
  const res = await client.post("/account/setup", { token: p.token, name: "Alex", password: PW, confirm: PW });
  expect(res.status).toBe(303);
  return { client, email, ...p };
}

async function addLesson(pid: number, tab: "full" | "quick", title: string, status = "published", extra: Record<string, string> = {}) {
  return (await env.DB.prepare("INSERT INTO programme_lessons (product_id, tab, position, title, body, status, youtube_id, image_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id")
    .bind(pid, tab, seq++, title, extra.body ?? "Some **bold** text", status, extra.youtube_id ?? null, extra.image_key ?? null)
    .first<number>("id"))!;
}

describe("account setup from the emailed link", () => {
  it("shows the buyer's email, rejects weak passwords, then creates the account and logs in", async () => {
    const email = uniqueEmail();
    const { token } = await purchase(email);
    const client = new TestClient(env);
    expect(await (await client.get(`/account/setup?token=${token}`)).text()).toContain(email);

    const weak = await client.post("/account/setup", { token, password: "short", confirm: "short" });
    expect(weak.status).toBe(422);
    const mismatch = await client.post("/account/setup", { token, password: PW, confirm: PW + "x" });
    expect(await mismatch.text()).toContain("match");

    const ok = await client.post("/account/setup", { token, name: "Alex", password: PW, confirm: PW });
    expect(ok.headers.get("Location")).toBe("/account?welcome=1");
    const account = await (await client.get("/account?welcome=1")).text();
    expect(account).toContain("Welcome, Alex");
    expect(account).toContain("Lower Body Regeneration");
    expect(account).toContain("Your account is ready");
    const user = await env.DB.prepare("SELECT email_verified_at, password_hash FROM users WHERE email = ?1").bind(email).first<any>();
    expect(user.email_verified_at).not.toBeNull();
    expect(user.password_hash).toMatch(/^pbkdf2_sha256\$/);
  });

  it("links work once only", async () => {
    const { token } = await member();
    const other = new TestClient(env);
    expect(await (await other.get(`/account/setup?token=${token}`)).text()).toContain("This link has expired");
    const res = await other.post("/account/setup", { token, password: PW, confirm: PW });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("This link has expired");
  });

  it("rejects made-up and expired links", async () => {
    const client = new TestClient(env);
    expect(await (await client.get("/account/setup?token=nonsense")).text()).toContain("This link has expired");
    const email = uniqueEmail();
    const { token } = await purchase(email);
    await env.DB.prepare("UPDATE email_tokens SET expires_at = '2000-01-01' WHERE email = ?1").bind(email).run();
    expect(await (await client.get(`/account/setup?token=${token}`)).text()).toContain("This link has expired");
  });
});

describe("login and logout", () => {
  it("logs in with the right password only, with a vague error for wrong details", async () => {
    const { email } = await member();
    const c = new TestClient(env);
    const bad = await c.post("/login", { email, password: "wrong password!!" });
    expect(bad.status).toBe(401);
    expect(await bad.text()).toContain("don&#39;t match");
    const unknown = await c.post("/login", { email: "nobody@example.com", password: PW });
    expect(unknown.status).toBe(401);
    const ok = await c.post("/login", { email: email.toUpperCase(), password: PW, next: "/account" });
    expect(ok.status).toBe(303);
    expect((await c.get("/account")).status).toBe(200);
  });

  it("limits repeated attempts on one account", async () => {
    const { email } = await member();
    const c = new TestClient(env);
    for (let i = 0; i < 10; i++) await c.post("/login", { email, password: "wrong password!!" });
    const res = await c.post("/login", { email, password: PW });
    expect(res.status).toBe(429);
  });

  it("logging out ends the session", async () => {
    const { client } = await member();
    await client.post("/logout");
    const res = await client.get("/account");
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/login?next=%2Faccount");
  });

  it("sends admins to the two-step admin login instead", async () => {
    const email = uniqueEmail();
    await env.DB.prepare("INSERT INTO users (email, password_hash, role) VALUES (?1, ?2, 'admin')").bind(email, await hashPassword(PW)).run();
    const c = new TestClient(env);
    const res = await c.post("/login", { email, password: PW });
    expect(res.headers.get("Location")).toBe("/admin/login");
    expect([...c.cookies.keys()].some((k) => k.includes("session"))).toBe(false);
  });

  it("only redirects to local pages after login", () => {
    expect(safeNext("/account/programmes/x")).toBe("/account/programmes/x");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/account");
    expect(safeNext("/\\evil.example")).toBe("/account");
  });

  it("shows Log in / My account in the menu", async () => {
    expect(await (await app.request("/", {}, env)).text()).toContain('href="/login"');
    const { client } = await member();
    expect(await (await client.get("/")).text()).toContain('href="/account"');
  });
});

describe("forgotten password and lost setup links", () => {
  const lastEmail = (to: string) => env.DB.prepare("SELECT template FROM email_log WHERE to_email = ?1 ORDER BY id DESC LIMIT 1").bind(to).first<string>("template");

  it("gives the same answer for unknown emails and sends nothing", async () => {
    const c = new TestClient(env);
    const res = await c.post("/forgot", { email: "unknown@example.com" });
    expect(await res.text()).toContain("If that email address has an account");
    expect(await lastEmail("unknown@example.com")).toBeNull();
  });

  it("sends a reset link to members, and a fresh setup link to buyers without an account", async () => {
    const { email } = await member();
    await new TestClient(env).post("/forgot", { email });
    expect(await lastEmail(email)).toBe("password_reset");

    const buyer = uniqueEmail();
    await purchase(buyer);
    await new TestClient(env).post("/forgot", { email: buyer });
    expect(await lastEmail(buyer)).toBe("account_setup");
  });

  it("reset changes the password and logs out other devices", async () => {
    const { client, email } = await member();
    const token = await createEmailToken(env.DB, "reset", email);
    const c = new TestClient(env);
    expect(await (await c.get(`/reset?token=${token}`)).text()).toContain("Choose a new password");
    const NEW = "my brand new password";
    const res = await c.post("/reset", { token, password: NEW, confirm: NEW });
    expect(res.headers.get("Location")).toBe("/login?reset=1");
    expect((await client.get("/account")).status).toBe(303); // old session gone
    expect((await new TestClient(env).post("/login", { email, password: NEW })).status).toBe(303);
    expect((await new TestClient(env).post("/login", { email, password: PW })).status).toBe(401);
  });
});

describe("programme reader", () => {
  it("shows published lessons in each tab, with video and formatting", async () => {
    const { client, productId: pid } = await member();
    await addLesson(pid, "full", "The philosophy", "published", { youtube_id: "dQw4w9WgXcQ", body: "## Why\n\n> Release first\n\n- one\n- two" });
    await addLesson(pid, "full", "Secret draft", "draft");
    await addLesson(pid, "quick", "Feet key points");

    const full = await (await client.get("/account/programmes/lower-body-regeneration")).text();
    expect(full).toContain("Read the Full Programme all the way through");
    expect(full).toContain("The philosophy");
    expect(full).not.toContain("Secret draft");
    expect(full).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(full).toContain('<aside class="key-point"><span class="key-point-label">Key point</span><p>Release first</p></aside>');
    expect(full).not.toContain("Feet key points");

    const quick = await (await client.get("/account/programmes/lower-body-regeneration?tab=quick")).text();
    expect(quick).toContain("Feet key points");
    expect(quick).toContain('aria-current="page">Quick Run-Through');
  });

  it("is only open to buyers, and closes after a refund", async () => {
    const owner = await member();
    const stranger = await member("hips");
    expect((await stranger.client.get("/account/programmes/lower-body-regeneration")).status).toBe(404);
    await env.DB.prepare("UPDATE entitlements SET revoked_at = datetime('now') WHERE order_id = ?1").bind(owner.orderId).run();
    expect((await owner.client.get("/account/programmes/lower-body-regeneration")).status).toBe(404);
    expect(await (await owner.client.get("/account")).text()).not.toContain("Lower Body Regeneration</h3>");
  });

  it("ticks and unticks lessons, and shows progress", async () => {
    const { client, productId: pid } = await member();
    const lesson = await addLesson(pid, "full", "Arches");
    await addLesson(pid, "full", "Toes");
    await client.post("/account/programmes/lower-body-regeneration/progress", { lesson: String(lesson), done: "yes", tab: "full" });
    // Other tests add lessons to the same programme, so compare against the live total.
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM programme_lessons WHERE product_id = ?1 AND status = 'published'").bind(pid).first<number>("n");
    expect(await (await client.get("/account")).text()).toContain(`1 of ${total} sections ticked off`);
    await client.post("/account/programmes/lower-body-regeneration/progress", { lesson: String(lesson), done: "no", tab: "full" });
    expect(await (await client.get("/account")).text()).toContain(`0 of ${total} sections ticked off`);
  });

  it("can't tick lessons from a programme you don't own", async () => {
    const { client } = await member();
    const otherLesson = await addLesson(await productId(env.DB, "hips"), "full", "Hips lesson");
    await client.post("/account/programmes/lower-body-regeneration/progress", { lesson: String(otherLesson), done: "yes" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM lesson_progress WHERE lesson_id = ?1").bind(otherLesson).first("n")).toBe(0);
  });

  it("serves programme images only to owners", async () => {
    const owner = await member();
    await env.MEDIA.put("lessons/test.png", new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "image/png" } });
    await addLesson(owner.productId, "full", "With image", "published", { image_key: "lessons/test.png" });
    const ok = await owner.client.get("/media/lessons/test.png");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("image/png");
    const stranger = await member("hips");
    expect((await stranger.client.get("/media/lessons/test.png")).status).toBe(404);
    expect((await app.request("/media/lessons/test.png", {}, env)).status).toBe(303);
  });
});

describe("account settings and UK GDPR", () => {
  it("toggles marketing emails with a consent record each time", async () => {
    const { client, email } = await member();
    await client.post("/account/marketing", { marketing: "yes" });
    expect(await (await client.get("/account")).text()).toContain("subscribed</strong>");
    await client.post("/account/marketing", { marketing: "no" });
    const rows = await env.DB.prepare("SELECT granted FROM consents WHERE email = ?1 AND kind = 'marketing_email' ORDER BY id").bind(email).all<any>();
    expect(rows.results.map((r) => r.granted)).toEqual([1, 0]);
  });

  it("changes password only with the current one", async () => {
    const { client, email } = await member();
    const NEW = "another long password";
    expect((await client.post("/account/password", { current: "nope nope nope", password: NEW, confirm: NEW })).status).toBe(401);
    expect((await client.post("/account/password", { current: PW, password: NEW, confirm: NEW })).headers.get("Location")).toBe("/account?password");
    expect((await client.get("/account")).status).toBe(200); // still logged in here
    expect((await new TestClient(env).post("/login", { email, password: NEW })).status).toBe(303);
  });

  it("downloads the member's data as JSON", async () => {
    const { client, email } = await member();
    const res = await client.get("/account/export");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const data = (await res.json()) as any;
    expect(data.account.email).toBe(email);
    expect(data.orders).toHaveLength(1);
    expect(data.programmeAccess[0].title).toBe("Lower Body Regeneration");
  });

  it("deletes the account only with the password, wiping personal details and ending access", async () => {
    const { client, email, orderId } = await member();
    expect((await client.post("/account/delete", { password: "wrong password!!" })).status).toBe(401);
    const res = await client.post("/account/delete", { password: PW });
    expect(res.headers.get("Location")).toBe("/?deleted=1");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?1").bind(email).first("n")).toBe(0);
    expect(await env.DB.prepare("SELECT revoked_at FROM entitlements WHERE order_id = ?1").bind(orderId).first("revoked_at")).not.toBeNull();
    expect((await client.get("/account")).status).toBe(303);
    expect((await new TestClient(env).post("/login", { email, password: PW })).status).toBe(401);
    expect(await env.DB.prepare("SELECT action FROM audit_log ORDER BY id DESC LIMIT 1").first("action")).toBe("account.delete");
  });
});

describe("text formatting and video links", () => {
  it("never lets typed HTML through", async () => {
    const html = await (await app.request("/", {}, env)).text(); // warm up
    expect(html).toBeTruthy();
    const out = String(<RichText source={'<script>alert(1)</script> **hi** [x](javascript:alert(1))'} />);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("<strong>hi</strong>");
    expect(out).not.toContain('href="javascript');
  });

  it("parses headings, lists and key points", () => {
    expect(parseBlocks("## Title\npara one\npara two\n\n- a\n- b\n\n1. x\n2. y\n\n> key")).toEqual([
      { kind: "h2", text: "Title" },
      { kind: "p", text: "para one para two" },
      { kind: "ul", items: ["a", "b"] },
      { kind: "ol", items: ["x", "y"] },
      { kind: "quote", text: "key" },
    ]);
  });

  it("understands every common YouTube link", () => {
    for (const url of ["dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1", "https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"]) {
      expect(youtubeId(url)).toBe("dQw4w9WgXcQ");
    }
    expect(youtubeId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("not a link")).toBeNull();
  });
});
