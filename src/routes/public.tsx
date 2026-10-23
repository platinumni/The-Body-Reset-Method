import { Hono } from "hono";
import type { AppEnv } from "../env";
import { isProduction } from "../env";
import { databaseIsHealthy } from "../services/health";
import { HomePage } from "../views/home";
import { pageMeta } from "./meta";

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/", (c) =>
  c.html(
    <HomePage
      meta={pageMeta(c, {
        title: c.env.SITE_NAME,
        description: "Release the tension, stop forcing and learn to trust your body again. Movement programmes built from the ground up.",
        path: "/",
        jsonLd: { "@context": "https://schema.org", "@type": "Organization", name: c.env.SITE_NAME, url: c.env.SITE_URL },
      })}
    />,
  ),
);

publicRoutes.get("/health", async (c) => {
  const db = await databaseIsHealthy(c.env.DB);
  return c.json({ ok: db, env: c.env.APP_ENV }, db ? 200 : 503);
});

// Only the live site may be indexed by search engines.
publicRoutes.get("/robots.txt", (c) =>
  c.text(isProduction(c.env) ? `User-agent: *\nAllow: /\n\nSitemap: ${c.env.SITE_URL}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n"),
);

const SITEMAP_PATHS = ["/"];

publicRoutes.get("/sitemap.xml", (c) => {
  const urls = SITEMAP_PATHS.map((p) => `  <url><loc>${new URL(p, c.env.SITE_URL).toString()}</loc></url>`).join("\n");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});
