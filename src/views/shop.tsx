import { CHECKOUT_CONSENTS, CONSENT_KINDS, type ConsentKind } from "../content/consents";
import type { Basket } from "../services/basket";
import type { Order } from "../services/orders";
import { formatPrice } from "../services/products";
import { Button } from "./components";
import { CsrfField, Layout, type PageMeta } from "./layout";

const CONSENT_LINKS: Partial<Record<ConsentKind, { href: string; text: string }>> = {
  health_declaration: { href: "/legal/health-disclaimer", text: "Read the health disclaimer" },
  terms: { href: "/legal/terms", text: "Read the terms" },
};

export function BasketPage(props: {
  meta: PageMeta;
  basket: Basket;
  csrfToken: string;
  errors?: string[];
  ticked?: Partial<Record<ConsentKind, boolean>>;
  checkoutReady: boolean;
  refCode?: string;
}) {
  const { basket } = props;
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <p class="eyebrow">Your basket</p>
          <h1>Basket</h1>
        </div>
      </section>
      <section class="band band-tight">
        <div class="wrap narrow">
          {basket.items.length === 0 ? (
            <div class="card">
              <p>Your basket is empty.</p>
              <Button href="/programmes">See the programmes</Button>
            </div>
          ) : (
            <>
              <ul class="basket-lines card">
                {basket.items.map((item) => (
                  <li class="basket-line">
                    <div>
                      <strong>{item.title}</strong>
                      {item.kind === "bundle" && <span class="small muted"> · Bundle</span>}
                    </div>
                    <div class="basket-line-end">
                      <span>{formatPrice(item.price_pence!, item.currency)}</span>
                      <form method="post" action="/basket/remove">
                        <CsrfField token={props.csrfToken} />
                        <input type="hidden" name="slug" value={item.slug} />
                        <button class="link-button" type="submit" aria-label={`Remove ${item.title}`}>
                          Remove
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
                <li class="basket-line basket-total">
                  <strong>Total</strong>
                  <strong>{formatPrice(basket.totalPence, basket.currency)}</strong>
                </li>
              </ul>

              {basket.addOns.length > 0 && (
                <div class="addons">
                  <h2 class="h3">Add to your order</h2>
                  <ul class="addon-list">
                    {basket.addOns.map((a) => (
                      <li class="addon card">
                        <div>
                          <strong>{a.title}</strong>
                          <span class="muted"> {formatPrice(a.price_pence!, a.currency)}</span>
                        </div>
                        <form method="post" action="/basket/add">
                          <CsrfField token={props.csrfToken} />
                          <input type="hidden" name="slug" value={a.slug} />
                          <button class="btn btn-ghost btn-small" type="submit">
                            Add
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <form method="post" action="/checkout" class="checkout card" novalidate>
                <CsrfField token={props.csrfToken} />
                <h2 class="h3">Before you pay</h2>
                {props.errors?.length ? (
                  <div class="form-errors" role="alert">
                    {props.errors.map((e) => (
                      <p>{e}</p>
                    ))}
                  </div>
                ) : null}
                {CONSENT_KINDS.map((k) => {
                  const c = CHECKOUT_CONSENTS[k];
                  const link = CONSENT_LINKS[k];
                  return (
                    <div class="check">
                      <input type="checkbox" id={`c-${k}`} name={k} value="yes" checked={!!props.ticked?.[k]} required={c.required} />
                      <label for={`c-${k}`}>
                        {c.label}
                        {c.required && <span class="sr-only"> (required)</span>}{" "}
                        {link && (
                          <a href={link.href} target="_blank" rel="noopener">
                            {link.text}
                          </a>
                        )}
                      </label>
                    </div>
                  );
                })}
                {basket.items.some((i) => i.slug !== "meal-plans") && (
                  <p class="small">
                    Movement programmes come with our <a href="/legal/refunds">90-day money-back guarantee</a>
                    {basket.items.some((i) => i.slug === "meal-plans") ? ". Budget Meal Plans aren't covered by it." : "."}
                  </p>
                )}
                <div class="field">
                  <label for="ref">Recommended by a member? Their code (optional)</label>
                  <input id="ref" name="ref" type="text" value={props.refCode ?? ""} maxlength={12} autocomplete="off" />
                </div>
                {props.checkoutReady ? (
                  <button class="btn btn-primary btn-wide" type="submit">
                    Continue to secure payment
                  </button>
                ) : (
                  <p class="notice">Checkout isn't switched on yet. Please check back soon.</p>
                )}
                <p class="small muted">
                  Payment is handled by Stripe: card, Apple Pay, Google Pay or PayPal where available. You don't need an account. After payment we
                  email you a link to set one up.
                </p>
              </form>
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}

export function CheckoutResultPage(props: { meta: PageMeta; order: Order | null }) {
  const o = props.order;
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          {!o ? (
            <>
              <h1>Order not found</h1>
              <p>If you've just paid, check your email for your confirmation.</p>
            </>
          ) : o.status === "paid" ? (
            <>
              <p class="eyebrow">Order {o.public_id}</p>
              <h1>Thank you. You're in.</h1>
              <p class="lede">We've emailed {o.email ? <strong>{o.email}</strong> : "you"} a link to create your account and open your programme.</p>
              <p>Can't see it? Check your spam folder. The link lasts 7 days.</p>
            </>
          ) : o.status === "pending" ? (
            <>
              <p class="eyebrow">Order {o.public_id}</p>
              <h1>Confirming your payment…</h1>
              <p class="lede">This usually takes a few seconds. This page will refresh on its own.</p>
            </>
          ) : (
            <>
              <h1>This order wasn't completed</h1>
              <p>No payment was taken. <a href="/basket">Return to your basket</a>.</p>
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
