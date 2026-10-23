import { Hono } from "hono";
import { NOT_FOR, PRINCIPLES, WHO_FOR, type Copy } from "../content/site";
import { loadSiteContent } from "../services/site-content";
import type { AppEnv } from "../env";
import { isProduction } from "../env";
import { getCookie } from "hono/cookie";
import { BASKET_COOKIE, parseBasket } from "../services/basket";
import { getCatalogueEntry, listCatalogue, programmesWithPages } from "../services/catalogue";
import { databaseIsHealthy } from "../services/health";
import { HomePage } from "../views/home";
import { LEGAL_PAGES, LegalPage, type LegalSlug } from "../views/legal";
import { AboutPage, FaqPage, MethodPage, ProgrammePage, ProgrammesPage } from "../views/pages";
import { pageMeta } from "./meta";

export const publicRoutes = new Hono<AppEnv>();

const plain = (copy: Copy) => (typeof copy === "string" ? copy : `[PLACEHOLDER: ${copy.placeholder}]`);

publicRoutes.get("/", async (c) => {
  const content = await loadSiteContent(c.env.DB);
  return c.html(
    <HomePage
      headline={content.headline}
      lede={content.lede}
      meta={pageMeta(c, {
        title: `${c.env.SITE_NAME}: release the tension, rebuild from the ground up`,
        description: "Release the tension, stop forcing and learn to love your body again. Movement programmes built from the ground up, starting with the feet.",
        path: "/",
        jsonLd: [
          { "@context": "https://schema.org", "@type": "Organization", name: c.env.SITE_NAME, url: c.env.SITE_URL },
          { "@context": "https://schema.org", "@type": "WebSite", name: c.env.SITE_NAME, url: c.env.SITE_URL },
        ],
      })}
      principles={PRINCIPLES}
      programmes={await listCatalogue(c.env.DB)}
      whoFor={WHO_FOR}
      notFor={NOT_FOR}
    />,
  );
});

publicRoutes.get("/method", (c) =>
  c.html(
    <MethodPage
      meta={pageMeta(c, {
        title: "The method: six principles",
        description: "Recognise, Release, Reconnect, Retrain, Strengthen, Integrate: the six principles behind every programme.",
        path: "/method",
      })}
      principles={PRINCIPLES}
    />,
  ),
);

publicRoutes.get("/programmes", async (c) =>
  c.html(
    <ProgrammesPage
      meta={pageMeta(c, { title: "Programmes", description: "Movement programmes built from the ground up, starting with the flagship Lower Body Regeneration.", path: "/programmes" })}
      programmes={await listCatalogue(c.env.DB)}
    />,
  ),
);

publicRoutes.get("/programmes/:slug", async (c) => {
  const programme = await getCatalogueEntry(c.env.DB, c.req.param("slug"));
  if (!programme || programme.status !== "available") return c.notFound();
  const path = `/programmes/${programme.slug}`;
  return c.html(
    <ProgrammePage
      meta={pageMeta(c, {
        title: programme.title,
        description: programme.short,
        path,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Course",
            name: programme.title,
            description: programme.short,
            url: new URL(path, c.env.SITE_URL).toString(),
            provider: { "@type": "Organization", name: c.env.SITE_NAME, url: c.env.SITE_URL },
          },
        ],
      })}
      programme={programme}
      whoFor={WHO_FOR}
      notFor={NOT_FOR}
      csrfToken={c.get("csrfToken")}
      inBasket={parseBasket(getCookie(c, BASKET_COOKIE)).includes(programme.slug)}
    />,
  );
});

publicRoutes.get("/about", async (c) => {
  const content = await loadSiteContent(c.env.DB);
  return c.html(
    <AboutPage
      meta={pageMeta(c, { title: "About the coach", description: "The coach behind The Body Regeneration Method and why the method exists.", path: "/about" })}
      coachName={content.coachName}
      story={content.coachStory}
    />,
  );
});

publicRoutes.get("/faq", async (c) => {
  const faqs = (await loadSiteContent(c.env.DB)).faqs;
  return c.html(
    <FaqPage
      meta={pageMeta(c, {
        title: "Frequently asked questions",
        description: "Answers about the method, who it's for, buying, access and safety.",
        path: "/faq",
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a.map(plain).join(" ") } })),
          },
        ],
      })}
      faqs={faqs}
    />,
  );
});

publicRoutes.get("/legal/:slug", (c) => {
  const slug = c.req.param("slug") as LegalSlug;
  const page = LEGAL_PAGES[slug];
  if (!Object.hasOwn(LEGAL_PAGES, slug) || !page) return c.notFound();
  return c.html(<LegalPage meta={pageMeta(c, { title: page.title, description: page.description, path: `/legal/${slug}` })} slug={slug} />);
});

publicRoutes.get("/health", async (c) => {
  const db = await databaseIsHealthy(c.env.DB);
  return c.json({ ok: db, env: c.env.APP_ENV }, db ? 200 : 503);
});

// Only the live site may be indexed by search engines.
publicRoutes.get("/robots.txt", (c) =>
  c.text(isProduction(c.env) ? `User-agent: *\nAllow: /\n\nSitemap: ${c.env.SITE_URL}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n"),
);

export function sitemapPaths(): string[] {
  return [
    "/",
    "/method",
    "/programmes",
    ...programmesWithPages().map((p) => `/programmes/${p.slug}`),
    "/about",
    "/faq",
    ...Object.keys(LEGAL_PAGES).map((s) => `/legal/${s}`),
  ];
}

publicRoutes.get("/sitemap.xml", (c) => {
  const urls = sitemapPaths()
    .map((p) => `  <url><loc>${new URL(p, c.env.SITE_URL).toString()}</loc></url>`)
    .join("\n");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});
