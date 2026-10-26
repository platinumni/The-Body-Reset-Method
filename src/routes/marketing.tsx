import { Hono } from "hono";
import { GUIDES, getGuide } from "../content/guides";
import { confirmSignupEmail, tasterConfirmEmail, welcomeEmail } from "../emails/automation";
import { inBackground } from "../lib/background";
import { cleanGe, queueEngineEvent, sendEngineEvents } from "../services/growth-engine";
import { runSequences, startSequence } from "../services/sequences";
import { TasterPage } from "../views/taster";
import type { AppEnv } from "../env";
import { rateLimit } from "../middleware/rate-limit";
import { looksLikeEmail, normaliseEmail } from "../services/accounts";
import { unsubscribeUrl } from "../services/campaigns";
import { sendEmail } from "../services/email";
import { hitRateLimit } from "../services/rate-limit";
import { loadSiteContent } from "../services/site-content";
import { confirmSubscription, subscribe } from "../services/subscribers";
import { GuidePage, GuidesIndexPage } from "../views/guides";
import { Layout } from "../views/layout";
import { pageMeta } from "./meta";

export const marketingRoutes = new Hono<AppEnv>();

const breadcrumbs = (siteUrl: string, items: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: new URL(path, siteUrl).toString() })),
});

marketingRoutes.get("/guides", async (c) => {
  const content = await loadSiteContent(c.env.DB);
  return c.html(
    <GuidesIndexPage
      meta={pageMeta(c, {
        title: "Free guides: tension, feet and moving from the ground up",
        description: "Free plain-English guides on releasing tension and gripping, why your feet matter, and the six principles of The Body Regeneration Method.",
        path: "/guides",
        jsonLd: [breadcrumbs(c.env.SITE_URL, [["Home", "/"], ["Guides", "/guides"]])],
      })}
      guides={GUIDES}
      csrfToken={c.get("csrfToken")}
      offer={content.offer}
    />,
  );
});

marketingRoutes.get("/guides/:slug", async (c) => {
  const guide = getGuide(c.req.param("slug"));
  if (!guide) return c.notFound();
  const path = `/guides/${guide.slug}`;
  const content = await loadSiteContent(c.env.DB);
  return c.html(
    <GuidePage
      meta={pageMeta(c, {
        title: guide.title,
        description: guide.description,
        path,
        ogType: "article",
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description: guide.description,
            datePublished: guide.published,
            dateModified: guide.published,
            mainEntityOfPage: new URL(path, c.env.SITE_URL).toString(),
            image: new URL("/og.png", c.env.SITE_URL).toString(),
            author: { "@type": "Organization", name: c.env.SITE_NAME, url: c.env.SITE_URL },
            publisher: { "@type": "Organization", name: c.env.SITE_NAME, url: c.env.SITE_URL },
          },
          breadcrumbs(c.env.SITE_URL, [["Home", "/"], ["Guides", "/guides"], [guide.title, path]]),
        ],
      })}
      guide={guide}
      others={GUIDES.filter((g) => g.slug !== guide.slug)}
      csrfToken={c.get("csrfToken")}
      offer={content.offer}
    />,
  );
});

// --- Email sign-up (double opt-in) ---

function MessagePage(props: { c: Parameters<typeof pageMeta>[0]; title: string; children: unknown }) {
  return (
    <Layout meta={pageMeta(props.c, { title: props.title, description: props.title, path: props.c.req.path, noindex: true })}>
      <section class="page-hero">
        <div class="wrap narrow">
          <h1>{props.title}</h1>
          {props.children as never}
        </div>
      </section>
    </Layout>
  );
}

marketingRoutes.post("/subscribe", rateLimit("subscribe", 8, 3600), async (c) => {
  const form = await c.req.parseBody();
  const email = normaliseEmail(String(form.email ?? ""));
  const source = String(form.source ?? "site").replace(/[^a-z-]/g, "").slice(0, 30) || "site";
  // Bots fill in the hidden "website" field; pretend it worked and do nothing.
  if (form.website) return c.html(<MessagePage c={c} title="Check your inbox"><p>We've sent you an email. Click the link inside to confirm.</p></MessagePage>);
  if (!looksLikeEmail(email)) {
    return c.html(<MessagePage c={c} title="That email doesn't look right"><p><a href="/#signup">Please try again</a>.</p></MessagePage>, 422);
  }
  if ((await hitRateLimit(c.env.DB, `subscribe-email:${email}`, 3, 3600)).allowed) {
    const ge = cleanGe(form.ge);
    const result = await subscribe(c.env.DB, email, source, ge);
    if (result.status === "confirm-sent") {
      const url = `${c.env.SITE_URL}/subscribe/confirm?token=${result.token}`;
      await sendEmail(c.env, source === "taster" ? tasterConfirmEmail({ siteName: c.env.SITE_NAME, to: email, url }) : confirmSignupEmail({ siteName: c.env.SITE_NAME, to: email, url }));
      await queueEngineEvent(c.env.DB, { type: "lead", ref: ge, code: null, value_pence: 0, confirmed: false, external_id: `lead-sub-${result.id}` });
      await inBackground(c, sendEngineEvents(c.env));
    } else if (source === "taster" && (await startSequence(c.env.DB, email, "taster"))) {
      // Already on the list: no need to confirm again, the taster just starts.
      await runSequences(c.env, new Date(), email);
    }
  }
  // Same answer either way, so nobody can test whether an address is on the list.
  return c.html(
    <MessagePage c={c} title="Check your inbox">
      <p class="lede">We've sent an email to {email}. Click the link inside to confirm, and you're in.</p>
      <p>Can't see it? Check your spam or promotions folder.</p>
      <p>
        <a href="/guides">Read our free guides while you wait →</a>
      </p>
    </MessagePage>,
  );
});

marketingRoutes.get("/subscribe/confirm", async (c) => {
  const confirmed = await confirmSubscription(c.env.DB, c.req.query("token") ?? "");
  if (!confirmed) {
    return c.html(<MessagePage c={c} title="That link has expired"><p>Confirmation links last 7 days. <a href="/#signup">Sign up again</a> and we'll send a fresh one.</p></MessagePage>, 400);
  }
  const content = await loadSiteContent(c.env.DB);
  const taster = confirmed.source === "taster";
  if (taster) {
    if (await startSequence(c.env.DB, confirmed.email, "taster")) await runSequences(c.env, new Date(), confirmed.email);
  } else if (confirmed.firstTime) {
    await sendEmail(c.env, welcomeEmail({ siteName: c.env.SITE_NAME, to: confirmed.email, offer: content.offer, siteUrl: c.env.SITE_URL, unsubscribeUrl: await unsubscribeUrl(c.env, confirmed.email) }));
  }
  if (confirmed.firstTime) {
    await queueEngineEvent(c.env.DB, { type: "signup", ref: confirmed.geRef, code: null, value_pence: 0, external_id: `signup-sub-${confirmed.id}` });
    await inBackground(c, sendEngineEvents(c.env));
  }
  if (taster) {
    return c.html(
      <MessagePage c={c} title="You're in">
        <p class="lede">Your first exercise is on its way to your inbox now. The next two follow over the next two days.</p>
        <p>
          <a href="/guides">Read our free guides while you wait →</a>
        </p>
      </MessagePage>,
    );
  }
  return c.html(
    <MessagePage c={c} title="You're in">
      <p class="lede">{content.offer?.code ? "Your welcome email (with your code) is on its way." : "Thanks for confirming. Your welcome email is on its way."}</p>
      <p>
        <a class="btn btn-primary" href="/programmes/lower-body-regeneration">
          Explore Lower Body Regeneration
        </a>
      </p>
    </MessagePage>,
  );
});

// --- Free Method taster: 3 emails, 3 foot exercises ---

marketingRoutes.get("/taster", (c) =>
  c.html(
    <TasterPage
      meta={pageMeta(c, {
        title: "Try the method free: 3 days, 3 foot exercises",
        description: "Three short emails over three days, each with one exercise from Stage 1 of Lower Body Regeneration. Free, and you can unsubscribe in one click.",
        path: "/taster",
      })}
      csrfToken={c.get("csrfToken")}
    />,
  ),
);
