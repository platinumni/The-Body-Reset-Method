import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

const get = (path: string, e: Env = env) => app.request(path, {}, e);

describe("public pages", () => {
  it("homepage renders with title, description and canonical", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<title>The Body Regeneration Method: [^<]+<\/title>/);
    expect(html).toContain('name="description"');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("application/ld+json");
  });

  it("unknown pages return a friendly 404", async () => {
    const res = await get("/no-such-page");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Page not found");
  });

  it("health check reports the database is up", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, env: "development" });
  });

  it("sitemap lists the homepage", async () => {
    const res = await get("/sitemap.xml");
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain("<loc>http://localhost:8787/</loc>");
    expect(xml).toContain("<loc>http://localhost:8787/programmes/lower-body-regeneration</loc>");
  });
});

describe("search engines", () => {
  it("test and dev sites block indexing", async () => {
    expect(await (await get("/robots.txt")).text()).toContain("Disallow: /");
    expect((await get("/")).headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await (await get("/")).text()).toContain('name="robots" content="noindex, nofollow"');
  });

  it("only the live site allows indexing", async () => {
    const live = { ...env, APP_ENV: "production", SITE_URL: "https://example.com" };
    expect(await (await get("/robots.txt", live)).text()).toContain("Sitemap: https://example.com/sitemap.xml");
    expect((await get("/", live)).headers.get("X-Robots-Tag")).toBeNull();
  });
});

describe("security headers", () => {
  it("are set on every page", async () => {
    const res = await get("/");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Checkout POSTs then redirect to Stripe: browsers apply form-action to that redirect.
    expect(csp).toContain("form-action 'self' https://checkout.stripe.com");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("are set on error pages too", async () => {
    expect((await get("/missing")).headers.get("Content-Security-Policy")).toBeTruthy();
  });
});

describe("static files", () => {
  it("serves versioned CSS with long caching and links it from pages", async () => {
    const html = await (await get("/")).text();
    const href = /href="(\/styles\.css\?v=[a-z0-9]+)"/.exec(html)?.[1];
    expect(href).toBeTruthy();
    const res = await get(href!);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/css");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(await res.text()).toContain("--bg");
  });

  it("serves the favicon", async () => {
    const res = await get("/favicon.svg");
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("can be added to a phone's home screen like an app", async () => {
    const page = await (await get("/")).text();
    expect(page).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest\?v=/);
    expect(page).toContain('rel="apple-touch-icon"');
    const res = await get("/manifest.webmanifest");
    expect(res.headers.get("Content-Type")).toBe("application/manifest+json");
    const m = (await res.json()) as { display: string; start_url: string; icons: { src: string }[] };
    expect(m).toMatchObject({ display: "standalone", start_url: "/account" });
    for (const i of m.icons) expect((await get(i.src)).headers.get("Content-Type")).toBe("image/png");
  });
});

describe("scheduled jobs", () => {
  it("weekly cron backs up the database", async () => {
    const { scheduled } = await import("../src/index");
    const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM backups").first<number>("n")) ?? 0;
    await scheduled({ cron: "0 3 * * SUN", scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM backups WHERE kind = 'weekly' AND status = 'ok'").first("n")).toBe(before + 1);
  });
});

describe("standards mode", () => {
  it("every page starts with a doctype (otherwise browsers use quirks mode)", async () => {
    for (const p of ["/", "/faq", "/no-such-page", "/admin/login"]) expect((await get(p)).headers.get("Content-Type")).toContain("text/html");
    for (const p of ["/", "/faq", "/no-such-page", "/admin/login"]) expect(await (await get(p)).text(), p).toMatch(/^<!DOCTYPE html>/);
  });
});

describe("live site addresses", () => {
  const live = { ...env, SITE_URL: "https://bodyregenerationmethod.com" } as Env;
  const go = (url: string) => app.request(url, {}, live);
  it("sends www and kitchen addresses to the right place", async () => {
    const w = await go("https://www.bodyregenerationmethod.com/faq?x=1");
    expect(w.status).toBe(301);
    expect(w.headers.get("Location")).toBe("https://bodyregenerationmethod.com/faq?x=1");
    expect((await go("https://kitchen.bodyregenerationmethod.com/")).headers.get("Location")).toBe("https://bodyregenerationmethod.com/kitchen");
    expect((await go("https://kitchen.bodyregenerationmethod.com/free-week?ge=tt")).headers.get("Location")).toBe("https://bodyregenerationmethod.com/kitchen/free-week?ge=tt");
    expect((await go("https://bodyregenerationmethod.com/health")).status).toBe(200);
  });
});
