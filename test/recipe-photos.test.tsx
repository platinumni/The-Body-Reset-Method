import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { hashPassword } from "../src/lib/crypto";
import { RECIPES } from "../src/lib/meal-plans/recipes";
import { currentStep, totpAt } from "../src/lib/totp";
import { searchTerms } from "../src/services/recipe-photos";
import { TestClient } from "./helpers";

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const pEnv = { ...env, ADMIN_ENC_KEY: KEY, PIXABAY_API_KEY: "pix_test" } as Env;
const PW = "admin password long enough";
let searches: string[] = [];
let empty = new Set<string>();

beforeEach(() => {
  searches = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const u = new URL(String(input));
    if (u.hostname === "pixabay.com" && u.pathname === "/api/") {
      const q = u.searchParams.get("q")!;
      searches.push(q);
      expect(u.searchParams.get("key")).toBe("pix_test");
      if (empty.has(q)) return Response.json({ hits: [] });
      const n = Number(u.searchParams.get("per_page"));
      return Response.json({ hits: Array.from({ length: n }, (_, i) => ({ id: 1000 + i, pageURL: `https://pixabay.com/photos/x-${1000 + i}/`, previewURL: `https://cdn.pixabay.com/p/${i}_150.jpg`, webformatURL: `https://cdn.pixabay.com/p/${i}_640.jpg`, largeImageURL: `https://pixabay.com/get/${i}_1280.jpg`, user: "Cook", tags: "soup, food" })) });
    }
    if (u.hostname.endsWith("pixabay.com")) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

let admin: TestClient;
beforeAll(async () => {
  const email = `photos-${Date.now()}@example.com`;
  await env.DB.prepare("INSERT INTO users (email, password_hash, role) VALUES (?1, ?2, 'admin')").bind(email, await hashPassword(PW)).run();
  admin = new TestClient(pEnv);
  await admin.get("/admin/login");
  await admin.post("/admin/login", { email, password: PW });
  const page = await (await admin.get("/admin/login/enrol")).text();
  const secret = /name="secret" value="([A-Z2-7]+)"/.exec(page)![1]!;
  await admin.post("/admin/login/enrol", { secret, code: await totpAt(secret, currentStep()) });
});

describe("recipe photos", () => {
  it("searches by dish name, then the main dish", () => {
    expect(searchTerms({ name: "Spiced carrot soup with yoghurt swirl" })).toEqual(["spiced carrot soup with yoghurt swirl", "spiced carrot soup"]);
    expect(searchTerms({ name: "Pasta e ceci (Italian chickpea pasta)" })).toEqual(["pasta e ceci"]);
  });

  it("auto-picks a batch, copies the image into our storage, records the licence, and serves it publicly", async () => {
    empty = new Set([searchTerms(RECIPES[1]!)].flat());
    await admin.post("/admin/photos/auto");
    const rows = await env.DB.prepare("SELECT recipe_id, licence, chosen_by FROM recipe_photos").all<any>();
    expect(rows.results.length).toBe(11); // one of 12 found nothing
    expect(rows.results[0].licence).toContain("Pixabay Content License");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM automation_sent WHERE kind = 'photo-no-match' AND ref = ?1").bind(RECIPES[1]!.id).first("n")).toBe(1);
    const id = rows.results[0].recipe_id;
    const img = await app.request(`/recipe-photos/${id}.jpg?v=1`, {}, pEnv);
    expect(img.status).toBe(200);
    expect(img.headers.get("Content-Type")).toBe("image/jpeg");
    // the next batch moves on rather than retrying the no-match recipe
    searches = [];
    await admin.post("/admin/photos/auto");
    expect(searches).not.toContain(searchTerms(RECIPES[1]!)[0]);
  });

  it("the owner can choose a different photo or remove it", async () => {
    const r = RECIPES[5]!;
    const page = await (await admin.get(`/admin/photos/${r.id}`)).text();
    expect(page).toContain("Use this one");
    expect(page).toContain("/admin/photos/preview?u=");
    await admin.post(`/admin/photos/${r.id}`, { id: "2001", page: "https://pixabay.com/photos/y-2001/", large: "https://pixabay.com/get/y.jpg", user: "Chef", q: "x" });
    expect(await env.DB.prepare("SELECT chosen_by FROM recipe_photos WHERE recipe_id = ?1").bind(r.id).first("chosen_by")).toBe("owner");
    await admin.post(`/admin/photos/${r.id}/remove`);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM recipe_photos WHERE recipe_id = ?1").bind(r.id).first("n")).toBe(0);
    expect((await app.request(`/recipe-photos/${r.id}.jpg`, {}, pEnv)).status).toBe(404);
  });

  it("never fetches images from anywhere but Pixabay", async () => {
    expect((await admin.get("/admin/photos/preview?u=https://evil.example/x.jpg")).status).toBe(404);
    await admin.post(`/admin/photos/${RECIPES[100]!.id}`, { id: "1", page: "https://pixabay.com/photos/z/", large: "https://evil.example/z.jpg" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM recipe_photos WHERE recipe_id = ?1").bind(RECIPES[100]!.id).first("n")).toBe(0);
  });

  it("is admin only", async () => {
    expect((await app.request("/admin/photos", {}, pEnv)).status).toBeGreaterThanOrEqual(300);
  });
});

describe("daily photo job", () => {
  it("does nothing without a key", async () => {
    const { dailyPhotoPick } = await import("../src/services/recipe-photos");
    expect(await dailyPhotoPick({ ...env, PIXABAY_API_KEY: undefined } as Env)).toBe("no key");
  });
});
