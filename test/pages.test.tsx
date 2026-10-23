import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { PRINCIPLES } from "../src/content/site";
import { app } from "../src/index";
import { sitemapPaths } from "../src/routes/public";

const get = (path: string, e: Env = env) => app.request(path, {}, e);
const live = { ...env, APP_ENV: "production", SITE_URL: "https://example.com" };

describe("every sitemap page", () => {
  const paths = sitemapPaths();

  it("covers the main pages", () => {
    expect(paths).toEqual(expect.arrayContaining(["/", "/method", "/programmes", "/programmes/lower-body-regeneration", "/about", "/faq", "/legal/privacy", "/legal/terms", "/legal/cookies", "/legal/refunds", "/legal/health-disclaimer"]));
  });

  it.each(paths)("%s renders with its own title, description and canonical", async (path) => {
    const res = await get(path, live);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<title>[^<]{10,}<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{20,}"/);
    expect(html).toContain(`<link rel="canonical" href="${new URL(path, "https://example.com").toString()}"/>`);
    expect(html).toContain('<html lang="en-GB">');
    expect(html).toContain('href="#main"');
  });

  it.each(paths)("%s has no inline styles or scripts (strict CSP)", async (path) => {
    const html = await (await get(path)).text();
    expect(html).not.toMatch(/\sstyle=/);
    // Only JSON-LD data blocks and our own external file (/app.js) are allowed; never inline code.
    expect(html.match(/<script(?![^>]*application\/ld\+json)(?![^>]*src="\/app\.js\?v=[a-z0-9]+")/g)).toBeNull();
    expect(html).not.toMatch(/<script src="[^"]*"[^>]*>[^<]+<\/script>/);
  });

  it("titles are all different", async () => {
    const titles = await Promise.all(paths.map(async (p) => /<title>([^<]+)<\/title>/.exec(await (await get(p)).text())?.[1]));
    expect(new Set(titles).size).toBe(paths.length);
  });
});

describe("homepage content", () => {
  it("shows the philosophy and all six principles in order", async () => {
    const html = await (await get("/")).text();
    expect(html).toContain("Let go of the tension,");
    expect(html).toContain("Learn to love your body again.");
    expect(html).toContain("never quite trust yourself in a balanced position");
    expect(html).toContain("Everything starts at the feet");
    expect(html).toContain("Shared freely with thousands of people around the world for years.");
    const positions = PRINCIPLES.map((p) => html.indexOf(`<h3>${p.title}</h3>`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("shows the flagship ground-up stages from the feet", async () => {
    const html = await (await get("/")).text();
    expect(html.indexOf("Feet, arches &amp; toes")).toBeLessThan(html.indexOf("Hips</h3>"));
  });

  it("includes the who-it's-not-for safety section", async () => {
    expect(await (await get("/")).text()).toContain("Not suitable without clearance");
  });
});

describe("programmes", () => {
  it("coming-soon programmes have no page yet", async () => {
    expect((await get("/programmes/upper-body")).status).toBe(404);
    expect((await get("/programmes/nope")).status).toBe(404);
  });

  it("flagship page has Course structured data and no live checkout yet", async () => {
    const html = await (await get("/programmes/lower-body-regeneration")).text();
    expect(html).toContain('"@type":"Course"');
    expect(html).toContain("Checkout opens soon");
  });
});

describe("FAQ", () => {
  it("publishes valid FAQPage structured data matching the visible questions", async () => {
    const html = await (await get("/faq")).text();
    const ld = /<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html)?.[1];
    const data = JSON.parse(ld!);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity.length).toBeGreaterThanOrEqual(8);
    for (const q of data.mainEntity) expect(html).toContain(`<summary>${q.name.replace(/'/g, "&#39;")}</summary>`);
  });
});

describe("legal pages", () => {
  it("unknown legal pages 404, including object built-ins", async () => {
    expect((await get("/legal/nope")).status).toBe(404);
    expect((await get("/legal/constructor")).status).toBe(404);
    expect((await get("/legal/toString")).status).toBe(404);
  });

  it("are marked as drafts until reviewed", async () => {
    expect(await (await get("/legal/terms")).text()).toContain("Draft wording");
  });
});

describe("placeholders and test-site banner", () => {
  it("unconfirmed text is visibly marked", async () => {
    const html = await (await get("/programmes/lower-body-regeneration")).text();
    expect(html).toContain('data-placeholder="true"');
    expect(html).toContain("[PLACEHOLDER: Flagship price]");
  });

  it("test site shows a banner; live site doesn't", async () => {
    expect(await (await get("/")).text()).toContain("Test site: not live");
    expect(await (await get("/", live)).text()).not.toContain("Test site: not live");
  });

  it("marks the current page in the navigation", async () => {
    expect(await (await get("/method")).text()).toContain('<a href="/method" aria-current="page">');
  });
});

describe("fonts", () => {
  it("are served self-hosted with long caching", async () => {
    const res = await get("/fonts/fraunces.woff2");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("font/woff2");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
  });
});
