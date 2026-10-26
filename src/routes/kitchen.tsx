import { Hono } from "hono";
import { freeWeekEmail } from "../emails/automation";
import type { AppEnv } from "../env";
import { inBackground } from "../lib/background";
import { priceBook } from "../lib/meal-plans/official";
import { buildPlan, type PlanInput } from "../lib/meal-plans/planner";
import { rateLimit } from "../middleware/rate-limit";
import { looksLikeEmail, normaliseEmail } from "../services/accounts";
import { sendEmail } from "../services/email";
import { cleanGe, queueEngineEvent, sendEngineEvents } from "../services/growth-engine";
import { DEFAULT_PREFS, readPlanInput } from "../services/meal-plans";
import { loadOfficialPrices } from "../services/official-prices";
import { hitRateLimit } from "../services/rate-limit";
import { openTrial, startTrial } from "../services/kitchen-trials";
import { photoUrls } from "../services/recipe-photos";
import { FreeWeekPage, FreeWeekResultPage } from "../views/kitchen-free-week";
import { pageMeta } from "./meta";
import { getCookie } from "hono/cookie";
import { CONSENT_KINDS, MEMBERSHIP_CONSENTS } from "../content/consents";
import { clientIp } from "../middleware/rate-limit";
import { activeAffiliateByCode, REF_COOKIE } from "../services/affiliates";
import { attachCheckoutSession, createPendingOrder, type ConsentAnswers } from "../services/orders";
import { createMembershipCheckout } from "../services/payments/stripe";
import { getProductsBySlugs, isMembership, isOnSale } from "../services/products";
import { recordStat } from "../services/stats";
import { MEAL_PLANS_SLUG } from "../services/meal-plans";


// Body Regeneration Kitchen free week: email only, no card.

export const kitchenRoutes = new Hono<AppEnv>();

const FREE_DEFAULTS = { ...DEFAULT_PREFS, budget: 30 };

const freeWeekMeta = (c: Parameters<typeof pageMeta>[0]) =>
  pageMeta(c, {
    title: "Free week of budget meals",
    description: "Tell us your weekly food budget and household and see a free week of healthy meals that fits, with what it should cost. Email only, no card.",
    path: "/kitchen/free-week",
  });

async function planFor(db: D1Database, input: PlanInput) {
  const prices = await loadOfficialPrices(db);
  const book = priceBook(prices, input.country, input.region);
  return { plan: buildPlan({ ...input, book }), source: book.source };
}

kitchenRoutes.get("/kitchen/free-week", (c) => c.html(<FreeWeekPage meta={freeWeekMeta(c)} csrfToken={c.get("csrfToken")} input={readPlanInput({}, FREE_DEFAULTS)} />));

kitchenRoutes.post("/kitchen/free-week", rateLimit("free-week", 6, 3600), async (c) => {
  const form = await c.req.parseBody({ all: true });
  const flat = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)]));
  const input = readPlanInput({ ...flat, seed: 1 + Math.floor(Math.random() * 1000) }, FREE_DEFAULTS);
  const email = normaliseEmail(String(flat.email ?? ""));
  const marketing = flat.marketing === "yes";
  if (!looksLikeEmail(email)) {
    return c.html(<FreeWeekPage meta={freeWeekMeta(c)} csrfToken={c.get("csrfToken")} input={input} email={email} marketing={marketing} errors={["Please enter a valid email address."]} />, 422);
  }
  const { plan, source } = await planFor(c.env.DB, input);
  const meta = pageMeta(c, { title: "Your free week", description: "Your free week of meals.", path: "/kitchen/week", noindex: true });
  // Bots fill in the hidden field: show a week, save nothing, send nothing.
  if (flat.website) return c.html(<FreeWeekResultPage meta={meta} plan={plan} justStarted={true} emailSent={true} priceSource={source} photos={await photoUrls(c.env.DB)} />);

  const geRef = cleanGe(flat.ge);
  const allowed = (await hitRateLimit(c.env.DB, `free-week-email:${email}`, 3, 86_400)).allowed;
  let emailSent = true;
  let shown = plan;
  if (allowed) {
    const trial = await startTrial(c.env.DB, email, input, plan.recipes.map((r) => r.recipe.id), plan.weeklyCost, { marketing, geRef });
    emailSent = trial.status === "new";
    if (trial.status === "exists") {
      // One free week per email: show the week they already have.
      const again = await openTrial(c.env.DB, trial.token);
      if (again) shown = (await planFor(c.env.DB, again.input)).plan;
    } else {
      await queueEngineEvent(c.env.DB, { type: "lead", ref: geRef, code: null, value_pence: 0, confirmed: false, external_id: `lead-kfw-${trial.id}` });
      await inBackground(c, sendEngineEvents(c.env));
    }
    await sendEmail(c.env, freeWeekEmail({ siteName: c.env.SITE_NAME, to: email, url: `${c.env.SITE_URL}/kitchen/week?token=${trial.token}`, again: trial.status === "exists" }));
  }
  return c.html(<FreeWeekResultPage meta={meta} plan={shown} justStarted={true} emailSent={emailSent} priceSource={source} photos={await photoUrls(c.env.DB)} />);
});

kitchenRoutes.get("/kitchen/week", async (c) => {
  const trial = await openTrial(c.env.DB, c.req.query("token") ?? "");
  const meta = pageMeta(c, { title: "Your free week", description: "Your free week of meals.", path: "/kitchen/week", noindex: true });
  if (!trial) return c.redirect("/kitchen/free-week", 302);
  if (trial.firstOpen) {
    await queueEngineEvent(c.env.DB, { type: "signup", ref: trial.geRef, code: null, value_pence: 0, external_id: `signup-kfw-${trial.id}` });
    await inBackground(c, sendEngineEvents(c.env));
  }
  const { plan, source } = await planFor(c.env.DB, trial.input);
  c.header("Referrer-Policy", "no-referrer");
  return c.html(<FreeWeekResultPage meta={meta} plan={plan} justStarted={false} emailSent={false} priceSource={source} photos={await photoUrls(c.env.DB)} />);
});

// Recipe photos, copied into our storage from Pixabay (see Admin → Recipe photos).
kitchenRoutes.get("/recipe-photos/:file", async (c) => {
  const m = /^([A-Za-z0-9_-]{1,40})\.jpg$/.exec(c.req.param("file"));
  const obj = m ? await c.env.MEDIA.get(`recipe-photos/${m[1]}.jpg`) : null;
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": c.req.query("v") ? "public, max-age=31536000, immutable" : "public, max-age=3600" } });
});

// --- Joining the Kitchen (monthly membership) ---

kitchenRoutes.post("/kitchen/join", rateLimit("checkout", 10, 600), async (c) => {
  const form = await c.req.parseBody();
  const [product] = await getProductsBySlugs(c.env.DB, [MEAL_PLANS_SLUG]);
  if (!product || !isOnSale(product) || !isMembership(product) || !c.env.STRIPE_SECRET_KEY) return c.redirect("/kitchen", 303);
  const consents = Object.fromEntries(CONSENT_KINDS.map((k) => [k, form[k] === "yes"])) as ConsentAnswers;
  if (MEMBERSHIP_CONSENTS.some((k) => !consents[k])) return c.redirect("/kitchen?missing=1#join", 303);

  const typedRef = String(form.ref ?? "").trim().toLowerCase();
  const refCandidate = typedRef || getCookie(c, REF_COOKIE) || "";
  const refCode = refCandidate && (await activeAffiliateByCode(c.env.DB, refCandidate)) ? refCandidate : null;
  const geRef = cleanGe(form.ge);
  const join = product.price_pence!;
  const monthly = product.monthly_pence!;
  const order = await createPendingOrder(c.env.DB, {
    items: [{ ...product, title: `${product.title} (joining fee and first month)`, price_pence: join + monthly }],
    consents,
    refCode,
    geRef,
    ip: clientIp(c.req.raw),
  });
  try {
    const session = await createMembershipCheckout(c.env.STRIPE_SECRET_KEY, {
      orderPublicId: order.public_id,
      title: product.title,
      joinPence: join,
      monthlyPence: monthly,
      currency: product.currency,
      successUrl: `${c.env.SITE_URL}/checkout/complete?order=${order.public_id}`,
      cancelUrl: `${c.env.SITE_URL}/kitchen`,
      metadata: Object.fromEntries(Object.entries({ ge: geRef, ref: refCode }).filter(([, v]) => !!v)) as Record<string, string>,
    });
    await attachCheckoutSession(c.env.DB, order.id, session.id);
    await recordStat(c.env.DB, "checkout_started");
    return c.redirect(session.url, 303);
  } catch (err) {
    console.error("Stripe membership checkout failed", { order: order.public_id, err: String(err) });
    return c.redirect("/kitchen?error=1#join", 303);
  }
});
