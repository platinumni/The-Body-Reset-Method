import { Hono } from "hono";
import { NOT_FOR, PRINCIPLES, WHO_FOR, type Copy } from "../content/site";
import { GUIDES } from "../content/guides";
import { loadSiteContent } from "../services/site-content";
import type { AppEnv } from "../env";
import { isProduction } from "../env";
import { getCookie } from "hono/cookie";
import { BASKET_COOKIE, parseBasket } from "../services/basket";
import { getCatalogueEntry, listCatalogue, programmesWithPages } from "../services/catalogue";
import { databaseIsHealthy } from "../services/health";
import { HomePage } from "../views/home";
import { LEGAL_PAGES, LegalPage, type LegalSlug } from "../views/legal";
import { AboutPage, ContactPage, FaqPage, MethodPage, ProgrammePage, ProgrammesPage } from "../views/pages";
import { rateLimit } from "../middleware/rate-limit";
import { contactProblem, saveContactMessage } from "../services/contact";
import { pageMeta } from "./meta";

export const publicRoutes = new Hono<AppEnv>();

const plain = (copy: Copy) => (typeof copy === "string" ? copy : `[PLACEHOLDER: ${copy.placeholder}]`);

const content = async (c: Parameters<typeof pageMeta>[0]) => c.get("siteContent") ?? (await loadSiteContent(c.env.DB));

publicRoutes.get("/", async (c) => {
  const site = await content(c);
  return c.html(
    <HomePage
      headline={site.headline}
      lede={site.lede}
      trackRecord={site.trackRecord}
      testimonials={site.testimonials}
      offer={site.offer}
      csrfToken={c.get("csrfToken")}
      meta={pageMeta(c, {
        title: `${c.env.SITE_NAME}: online movement programmes from the ground up`,
        description:
          "Release the tension and gripping your body holds on to, and rebuild strength and balance from the ground up, starting with your feet. Online programmes you can follow at home.",
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
      meta={pageMeta(c, {
        title: "Online movement programmes: lower body, hips, upper body and more",
        description: "Online movement programmes built from the ground up, starting with Lower Body Regeneration: feet, arches and toes, calves, knees and hips.",
        path: "/programmes",
      })}
      programmes={await listCatalogue(c.env.DB)}
    />,
  ),
);

publicRoutes.get("/programmes/:slug", async (c) => {
  const programme = await getCatalogueEntry(c.env.DB, c.req.param("slug"));
  if (!programme || programme.status !== "available") return c.notFound();
  const path = `/programmes/${programme.slug}`;
  const site = await content(c);
  const url = new URL(path, c.env.SITE_URL).toString();
  return c.html(
    <ProgrammePage
      meta={pageMeta(c, {
        title: programme.flagship ? `${programme.title}: feet, calves, knees and hips programme` : programme.title,
        description: programme.flagship
          ? "An online lower body programme that starts with your feet, arches and toes, then works up through the Achilles, calves, knees and hips. Release tension, then rebuild strength and balance."
          : programme.short,
        path,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Course",
            name: programme.title,
            description: programme.short,
            url,
            provider: { "@type": "Organization", name: c.env.SITE_NAME, url: c.env.SITE_URL },
            ...(programme.onSale && programme.product?.price_pence
              ? {
                  offers: {
                    "@type": "Offer",
                    price: (programme.product.price_pence / 100).toFixed(2),
                    priceCurrency: programme.product.currency.toUpperCase(),
                    availability: "https://schema.org/InStock",
                    category: "Paid",
                    url,
                  },
                  hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: "Self-paced" },
                }
              : {}),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: new URL("/", c.env.SITE_URL).toString() },
              { "@type": "ListItem", position: 2, name: "Programmes", item: new URL("/programmes", c.env.SITE_URL).toString() },
              { "@type": "ListItem", position: 3, name: programme.title, item: url },
            ],
          },
        ],
      })}
      programme={programme}
      whoFor={WHO_FOR}
      notFor={NOT_FOR}
      csrfToken={c.get("csrfToken")}
      inBasket={parseBasket(getCookie(c, BASKET_COOKIE)).includes(programme.slug)}
      trackRecord={site.trackRecord}
      testimonials={site.testimonials}
      offer={site.offer}
      faqs={site.faqs}
    />,
  );
});

publicRoutes.get("/about", async (c) => {
  const site = await content(c);
  return c.html(
    <AboutPage
      meta={pageMeta(c, { title: "About the coach", description: "The coach behind The Body Regeneration Method and why the method exists.", path: "/about" })}
      coachName={site.coachName}
      story={site.coachStory}
    />,
  );
});

publicRoutes.get("/faq", async (c) => {
  const faqs = (await content(c)).faqs;
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

const contactMeta = (c: Parameters<typeof pageMeta>[0]) =>
  pageMeta(c, { title: "Contact", description: "Get in touch with The Body Regeneration Method. Send us a message and we'll reply by email.", path: "/contact" });

publicRoutes.get("/contact", (c) => c.html(<ContactPage meta={contactMeta(c)} csrfToken={c.get("csrfToken")} sent={c.req.query("sent") !== undefined} />));

publicRoutes.post("/contact", rateLimit("contact", 5, 900), async (c) => {
  const form = await c.req.parseBody();
  const values = { name: String(form.name ?? "").trim(), email: String(form.email ?? "").trim(), message: String(form.message ?? "").trim() };
  // Bots fill in the hidden field; pretend it worked.
  if (String(form.website ?? "")) return c.redirect("/contact?sent", 303);
  const error = contactProblem(values);
  if (error) return c.html(<ContactPage meta={contactMeta(c)} csrfToken={c.get("csrfToken")} error={error} values={values} />, 422);
  await saveContactMessage(c.env, values);
  return c.redirect("/contact?sent", 303);
});

export function sitemapPaths(): string[] {
  return [
    "/",
    "/method",
    "/programmes",
    ...programmesWithPages().map((p) => `/programmes/${p.slug}`),
    "/guides",
    ...GUIDES.map((g) => `/guides/${g.slug}`),
    "/about",
    "/faq",
    "/contact",
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
