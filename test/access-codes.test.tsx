import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { hashPassword } from "../src/lib/crypto";
import { currentStep, totpAt } from "../src/lib/totp";
import { publishedReviews } from "../src/services/reviews";
import { TestClient } from "./helpers";

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const cEnv = { ...env, ADMIN_ENC_KEY: KEY, RESEND_API_KEY: "re_test" } as Env;
const PW = "admin password long enough";
let mails: any[] = [];
let seq = 0;
const uniq = (p: string) => `${p}${++seq}-${Date.now()}@example.com`;
const confirmToken = (m: any) => /\/redeem\/confirm\?token=([0-9a-f]+)/.exec(m.text)?.[1];

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

let admin: TestClient;
beforeAll(async () => {
  const email = uniq("codeadmin");
  await env.DB.prepare("INSERT INTO users (email, password_hash, role) VALUES (?1, ?2, 'admin')").bind(email, await hashPassword(PW)).run();
  admin = new TestClient(cEnv);
  await admin.get("/admin/login");
  await admin.post("/admin/login", { email, password: PW });
  const page = await (await admin.get("/admin/login/enrol")).text();
  const secret = /name="secret" value="([A-Z2-7]+)"/.exec(page)![1]!;
  await admin.post("/admin/login/enrol", { secret, code: await totpAt(secret, currentStep()) });
});

const TICKS = { health_declaration: "yes", terms: "yes" };
const makeCode = (fields: Record<string, string>) => admin.post("/admin/codes", { kind: "partner", label: "Acme Gym", slugs: "lower-body-regeneration", ...fields });
const redeem = async (code: string, email: string) => {
  const c = new TestClient(cEnv);
  const before = mails.length;
  await c.post("/redeem", { code, email, ...TICKS });
  const mail = mails.slice(before).find((m) => m.to[0] === email);
  const token = mail ? confirmToken(mail) : undefined;
  return { c, token, res: token ? await c.get(`/redeem/confirm?token=${token}`) : null };
};
const hasAccess = (email: string, slug: string) =>
  env.DB.prepare("SELECT COUNT(*) AS n FROM entitlements e JOIN products p ON p.id = e.product_id WHERE e.email = ?1 AND p.slug = ?2 AND e.revoked_at IS NULL").bind(email, slug).first<number>("n");

describe("partner access codes", () => {
  it("admin creates a code; a member confirms by email and gets access and an account-setup link", async () => {
    expect((await makeCode({ code: "ACME-GYM", max_uses: "2", monthly_fee: "99" })).status).toBe(303);
    const email = uniq("member");
    const { res } = await redeem("acme-gym", email);
    expect(res!.status).toBe(303);
    expect(res!.headers.get("Location")).toMatch(/^\/account\/setup\?token=/);
    expect(await hasAccess(email, "lower-body-regeneration")).toBe(1);
    const consents = await env.DB.prepare("SELECT kind FROM consents WHERE email = ?1 ORDER BY kind").bind(email).all<{ kind: string }>();
    expect(consents.results.map((r) => r.kind)).toEqual(["health_declaration", "terms"]);
    const page = await (await admin.get("/admin/codes")).text();
    expect(page).toContain("ACME-GYM");
    expect(page).toContain("£99.00/month");
  });

  it("gives no access until the email link is clicked, and the same answer for bad codes", async () => {
    const email = uniq("pending");
    const c = new TestClient(cEnv);
    const ok = await (await c.post("/redeem", { code: "ACME-GYM", email, ...TICKS })).text();
    const bad = await (await new TestClient(cEnv).post("/redeem", { code: "NOPE-NOPE", email: uniq("x"), ...TICKS })).text();
    expect(ok).toContain("Check your inbox");
    expect(bad).toContain("Check your inbox");
    expect(await hasAccess(email, "lower-body-regeneration")).toBe(0);
  });

  it("stops at the maximum number of people, and doesn't count the same person twice", async () => {
    await makeCode({ code: "TINY-CLUB", max_uses: "1" });
    const first = uniq("first");
    await redeem("TINY-CLUB", first);
    const again = await redeem("TINY-CLUB", first);
    expect(again.res).toBeNull(); // code full: no email sent
    const second = await redeem("TINY-CLUB", uniq("second"));
    expect(second.token).toBeUndefined();
    expect(await env.DB.prepare("SELECT uses FROM access_codes WHERE code = 'TINY-CLUB'").first("uses")).toBe(1);
  });

  it("pausing stops new members; ending removes the access it gave", async () => {
    await makeCode({ code: "END-ME" });
    const email = uniq("ended");
    await redeem("END-ME", email);
    const id = await env.DB.prepare("SELECT id FROM access_codes WHERE code = 'END-ME'").first<number>("id");
    await admin.post(`/admin/codes/${id}/status`, { status: "paused" });
    expect((await redeem("END-ME", uniq("late"))).token).toBeUndefined();
    await admin.post(`/admin/codes/${id}/status`, { status: "ended" }); // needs the confirm tick
    expect(await hasAccess(email, "lower-body-regeneration")).toBe(1);
    await admin.post(`/admin/codes/${id}/status`, { status: "ended", confirm: "yes" });
    expect(await hasAccess(email, "lower-body-regeneration")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'code.ended'").first("n")).toBeGreaterThan(0);
  });

  it("rejects bad input in admin", async () => {
    expect((await admin.post("/admin/codes", { kind: "partner", code: "x", label: "", slugs: "" })).status).toBe(422);
  });
});

describe("beta tester codes", () => {
  it("unlocks free access, and their published reviews say they had it free", async () => {
    await makeCode({ code: "BETA-2026", kind: "beta", label: "Beta testers" });
    const email = uniq("beta");
    await redeem("BETA-2026", email);
    expect(mails.at(-1).text).toContain("Thanks for helping test");
    const uid = await env.DB.prepare("INSERT INTO users (email, password_hash) VALUES (?1, 'x') RETURNING id").bind(email).first<number>("id");
    await env.DB.prepare("INSERT INTO reviews (user_id, rating, body, display_name, may_publish, status) VALUES (?1, 4, 'Honest feedback here.', 'Beta B.', 1, 'approved')").bind(uid).run();
    const r = (await publishedReviews(env.DB)).find((x) => x.who === "Beta B.");
    expect(r?.note).toBe("Given free access as a beta tester");
  });
});

describe("redeem page", () => {
  it("prefills the code from a share link and needs both ticks", async () => {
    const html = await (await app.request("/redeem?code=ACME-GYM", {}, cEnv)).text();
    expect(html).toContain('value="ACME-GYM"');
    expect((await new TestClient(cEnv).post("/redeem", { code: "ACME-GYM", email: uniq("t") })).status).toBe(422);
  });
});
