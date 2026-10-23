import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { CHECKOUT_CONSENTS, CONSENT_KINDS, type ConsentKind } from "../content/consents";
import { orderConfirmationEmail } from "../emails/templates";
import type { AppEnv } from "../env";
import { isDevelopment } from "../env";
import { clientIp, rateLimit } from "../middleware/rate-limit";
import { activeAffiliateByCode, cancelCommissionForOrder, createCommissionForOrder, REF_COOKIE } from "../services/affiliates";
import { BASKET_COOKIE, loadBasket, parseBasket, serializeBasket } from "../services/basket";
import { sendEmail } from "../services/email";
import { recordStat } from "../services/stats";
import {
  attachCheckoutSession,
  createPendingOrder,
  getOrderByPublicId,
  getOrderLines,
  isNewStripeEvent,
  markOrderExpired,
  markOrderPaid,
  markOrderRefunded,
  recordStripeEvent,
  type ConsentAnswers,
  type PaidSession,
} from "../services/orders";
import { createCheckoutSession, verifyWebhook } from "../services/payments/stripe";
import { BasketPage, CheckoutResultPage } from "../views/shop";
import { pageMeta } from "./meta";

export const shopRoutes = new Hono<AppEnv>();

const basketSlugs = (c: Context<AppEnv>) => parseBasket(getCookie(c, BASKET_COOKIE));

function saveBasket(c: Context<AppEnv>, slugs: string[]) {
  if (!slugs.length) return deleteCookie(c, BASKET_COOKIE, { path: "/" });
  setCookie(c, BASKET_COOKIE, serializeBasket(slugs), { path: "/", httpOnly: true, secure: !isDevelopment(c.env), sameSite: "Lax", maxAge: 30 * 86_400 });
}

const basketMeta = (c: Context<AppEnv>, count: number) =>
  pageMeta(c, { title: "Basket", description: "Your basket.", path: "/basket", noindex: true, basketCount: count });

shopRoutes.get("/basket", async (c) => {
  const basket = await loadBasket(c.env.DB, basketSlugs(c));
  return c.html(<BasketPage meta={basketMeta(c, basket.items.length)} basket={basket} csrfToken={c.get("csrfToken")} checkoutReady={!!c.env.STRIPE_SECRET_KEY} refCode={getCookie(c, REF_COOKIE) ?? ""} />);
});

shopRoutes.post("/basket/add", async (c) => {
  const slug = String((await c.req.parseBody()).slug ?? "");
  const current = basketSlugs(c);
  const basket = await loadBasket(c.env.DB, [...current, slug]);
  // Only keep what's genuinely on sale.
  saveBasket(c, basket.items.map((i) => i.slug));
  if (basket.items.some((i) => i.slug === slug) && !current.includes(slug)) await recordStat(c.env.DB, "add_to_basket", slug);
  return c.redirect("/basket", 303);
});

shopRoutes.post("/basket/remove", async (c) => {
  const slug = String((await c.req.parseBody()).slug ?? "");
  saveBasket(c, basketSlugs(c).filter((s) => s !== slug));
  return c.redirect("/basket", 303);
});

shopRoutes.post("/checkout", rateLimit("checkout", 10, 600), async (c) => {
  const form = await c.req.parseBody();
  const basket = await loadBasket(c.env.DB, basketSlugs(c));
  if (!basket.items.length) return c.redirect("/basket", 303);

  const consents = Object.fromEntries(CONSENT_KINDS.map((k) => [k, form[k] === "yes"])) as ConsentAnswers;
  const missing = CONSENT_KINDS.filter((k) => CHECKOUT_CONSENTS[k].required && !consents[k]);
  const ready = !!c.env.STRIPE_SECRET_KEY;
  if (missing.length || !ready) {
    const errors = missing.length ? ["Please tick each of the required boxes to continue."] : [];
    return c.html(
      <BasketPage meta={basketMeta(c, basket.items.length)} basket={basket} csrfToken={c.get("csrfToken")} errors={errors} ticked={consents as Record<ConsentKind, boolean>} checkoutReady={ready} refCode={String(form.ref ?? "")} />,
      ready ? 422 : 503,
    );
  }

  // Referral: a code typed at checkout wins over the remembered link.
  const typedRef = String(form.ref ?? "").trim().toLowerCase();
  const refCandidate = typedRef || getCookie(c, REF_COOKIE) || "";
  const refCode = refCandidate && (await activeAffiliateByCode(c.env.DB, refCandidate)) ? refCandidate : null;
  const order = await createPendingOrder(c.env.DB, { items: basket.items, consents, refCode, ip: clientIp(c.req.raw) });
  try {
    const session = await createCheckoutSession(c.env.STRIPE_SECRET_KEY!, {
      orderPublicId: order.public_id,
      currency: order.currency,
      lines: basket.items.map((i) => ({ title: i.title, pence: i.price_pence! })),
      successUrl: `${c.env.SITE_URL}/checkout/complete?order=${order.public_id}`,
      cancelUrl: `${c.env.SITE_URL}/basket`,
    });
    await attachCheckoutSession(c.env.DB, order.id, session.id);
    await recordStat(c.env.DB, "checkout_started");
    return c.redirect(session.url, 303);
  } catch (err) {
    console.error("Stripe checkout failed", { order: order.public_id, err: String(err) });
    return c.html(
      <BasketPage meta={basketMeta(c, basket.items.length)} basket={basket} csrfToken={c.get("csrfToken")} errors={["Payment couldn't be started just now. Please try again in a minute."]} ticked={consents as Record<ConsentKind, boolean>} checkoutReady={ready} refCode={String(form.ref ?? "")} />,
      502,
    );
  }
});

shopRoutes.get("/checkout/complete", async (c) => {
  const order = await getOrderByPublicId(c.env.DB, c.req.query("order") ?? "");
  if (order?.status === "paid") saveBasket(c, []);
  if (order?.status === "pending") c.header("Refresh", "4");
  return c.html(<CheckoutResultPage meta={pageMeta(c, { title: "Your order", description: "Order status.", path: "/checkout/complete", noindex: true, basketCount: order?.status === "paid" ? 0 : undefined })} order={order} />);
});

// Stripe calls this after payment events. Authenticated by signature, not CSRF.
shopRoutes.post("/webhooks/stripe", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.text("Webhook not configured", 503);
  const payload = await c.req.text();
  const event = await verifyWebhook(secret, payload, c.req.header("Stripe-Signature"));
  if (!event) return c.text("Invalid signature", 400);
  if (!(await isNewStripeEvent(c.env.DB, event.id))) return c.json({ received: true, duplicate: true });

  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (obj.payment_status !== "paid") break; // slower payment methods confirm later
      const result = await markOrderPaid(c.env.DB, obj as PaidSession);
      if (result.outcome === "paid") {
        await recordStat(c.env.DB, "purchase");
        await createCommissionForOrder(c.env.DB, result.order, result.email);
        const lines = await getOrderLines(c.env.DB, result.order.id);
        await sendEmail(
          c.env,
          orderConfirmationEmail({
            siteName: c.env.SITE_NAME,
            to: result.email,
            name: result.order.name ?? (obj as PaidSession).customer_details?.name ?? null,
            orderRef: result.order.public_id,
            lines: lines.map((l) => ({ title: l.title, pence: l.price_pence })),
            totalPence: result.order.amount_paid_pence ?? result.order.total_pence,
            discountPence: result.order.total_pence - (result.order.amount_paid_pence ?? result.order.total_pence),
            currency: result.order.currency,
            setupUrl: result.setupToken ? `${c.env.SITE_URL}/account/setup?token=${result.setupToken}` : null,
            loginUrl: `${c.env.SITE_URL}/login`,
          }),
        );
      } else if (result.outcome !== "already-processed") {
        console.error("Paid session not applied", { outcome: result.outcome, session: obj.id });
      }
      break;
    }
    case "checkout.session.expired":
      await markOrderExpired(c.env.DB, String(obj.id));
      break;
    case "charge.refunded":
      // Only a full refund removes access; partial refunds keep it.
      if (obj.refunded === true && obj.payment_intent) {
        const refunded = await markOrderRefunded(c.env.DB, String(obj.payment_intent));
        if (refunded && (await cancelCommissionForOrder(c.env.DB, refunded.id)) === "already-paid") {
          console.warn("Refunded order's commission was already paid out", { order: refunded.public_id });
        }
      }
      break;
  }
  await recordStripeEvent(c.env.DB, event.id, event.type);
  return c.json({ received: true });
});
