import { bytesToHex, timingSafeEqual } from "../../lib/crypto";

// Stripe, called directly over HTTPS (no SDK needed in Workers).
// All payment-provider code lives in this file, so switching provider means changing one module.

const API = "https://api.stripe.com/v1";

export type CheckoutLine = { title: string; pence: number };

export type CheckoutRequest = {
  orderPublicId: string;
  lines: CheckoutLine[];
  currency: string;
  successUrl: string;
  cancelUrl: string;
};

/** Flatten nested params into Stripe's form encoding: line_items[0][price_data][currency]=gbp */
export function toForm(params: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (typeof v === "object") toForm(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class StripeError extends Error {}

async function stripePost<T>(secretKey: string, path: string, params: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: toForm(params),
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new StripeError(body.error?.message ?? `Stripe error ${res.status}`);
  return body;
}

export async function createCheckoutSession(secretKey: string, req: CheckoutRequest): Promise<{ id: string; url: string }> {
  const lineItems = Object.fromEntries(
    req.lines.map((l, i) => [i, { quantity: 1, price_data: { currency: req.currency, unit_amount: l.pence, product_data: { name: l.title } } }]),
  );
  return stripePost(
    secretKey,
    "/checkout/sessions",
    {
      mode: "payment",
      client_reference_id: req.orderPublicId,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      line_items: lineItems,
      billing_address_collection: "auto",
      metadata: { order_public_id: req.orderPublicId },
      payment_intent_data: { metadata: { order_public_id: req.orderPublicId } },
    },
    `checkout-${req.orderPublicId}`,
  );
}

export async function refundPaymentIntent(secretKey: string, paymentIntent: string): Promise<void> {
  await stripePost(secretKey, "/refunds", { payment_intent: paymentIntent }, `refund-${paymentIntent}`);
}

// --- Webhooks ---------------------------------------------------------------

export type StripeEvent = { id: string; type: string; data: { object: Record<string, any> } };

const WEBHOOK_TOLERANCE_SECONDS = 300;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** Build a valid Stripe-Signature header (used by tests and local tools). */
export async function signWebhook(secret: string, payload: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${payload}`)}`;
}

/** Check a webhook really came from Stripe: HMAC signature over the exact body, and recent. */
export async function verifyWebhook(secret: string, payload: string, header: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)): Promise<StripeEvent | null> {
  if (!header) return null;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSeconds - t) > WEBHOOK_TOLERANCE_SECONDS) return null;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  if (!sigs.some((s) => timingSafeEqual(s, expected))) return null;
  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    return null;
  }
}
