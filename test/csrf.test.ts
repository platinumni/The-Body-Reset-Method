import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/env";
import { csrf, csrfCookieName } from "../src/middleware/csrf";

const app = new Hono<AppEnv>();
app.use("*", csrf);
app.get("/form", (c) => c.text(c.get("csrfToken")));
app.post("/form", (c) => c.text("saved"));

const URL_ = "http://localhost/form";

async function freshToken() {
  const res = await app.request(URL_, {}, env);
  const cookie = res.headers.get("Set-Cookie") ?? "";
  return { token: await res.text(), cookie: cookie.split(";")[0]! };
}

const post = (body: string, headers: Record<string, string>) =>
  app.request(URL_, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers } }, env);

describe("CSRF protection", () => {
  it("issues an HttpOnly token cookie on first visit", async () => {
    const res = await app.request(URL_, {}, env);
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain(`${csrfCookieName(env)}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("uses a Secure __Host- cookie outside local development", () => {
    expect(csrfCookieName({ ...env, APP_ENV: "staging" })).toBe("__Host-brm_csrf");
  });

  it("accepts a form with the matching token", async () => {
    const { token, cookie } = await freshToken();
    const res = await post(`_csrf=${token}`, { Cookie: cookie });
    expect(res.status).toBe(200);
  });

  it("rejects a form with no token", async () => {
    const { cookie } = await freshToken();
    expect((await post("name=x", { Cookie: cookie })).status).toBe(403);
  });

  it("rejects a form with the wrong token", async () => {
    const { cookie } = await freshToken();
    expect((await post("_csrf=forged", { Cookie: cookie })).status).toBe(403);
  });

  it("rejects a form with no cookie", async () => {
    const { token } = await freshToken();
    expect((await post(`_csrf=${token}`, {})).status).toBe(403);
  });

  it("rejects cross-site requests even with a token", async () => {
    const { token, cookie } = await freshToken();
    expect((await post(`_csrf=${token}`, { Cookie: cookie, Origin: "https://evil.example" })).status).toBe(403);
  });

  it("accepts a JSON request with the token header", async () => {
    const { token, cookie } = await freshToken();
    const res = await app.request(URL_, { method: "POST", body: "{}", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": token } }, env);
    expect(res.status).toBe(200);
  });
});
