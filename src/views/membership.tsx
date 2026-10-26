import type { Subscription } from "../services/subscriptions";
import { formatPrice } from "../services/products";
import { CsrfField, Layout, type PageMeta } from "./layout";

const longDate = (sql: string | null) => (sql ? new Date(sql.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null);

const DONE: Record<string, string> = {
  cancelled: "Cancelled. You won't be charged again, and we've emailed you to confirm.",
  resumed: "Your membership carries on as normal.",
  error: "That didn't go through just now. Please try again in a minute, or contact us.",
};

/** A member's Body Regeneration Kitchen membership: what they pay, when, and a two-click cancel. */
export function MembershipPage(props: { meta: PageMeta; csrfToken: string; sub: Subscription | null; monthly: { monthly_pence: number | null; currency: string } | null; done: string | null }) {
  const { sub } = props;
  const until = longDate(sub?.current_period_end ?? null);
  const price = props.monthly?.monthly_pence != null ? formatPrice(props.monthly.monthly_pence, props.monthly.currency) : null;
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <p class="small">
            <a href="/account/meal-plans">← Your meal plans</a>
          </p>
          <h1>Your Kitchen membership</h1>
          {props.done && DONE[props.done] && (
            <p class={`notice ${props.done === "error" ? "" : "notice-ok"}`} role="status">
              {DONE[props.done]}
            </p>
          )}
          {!sub ? (
            <p>You don't have a Body Regeneration Kitchen membership. <a href="/kitchen">Find out more</a>.</p>
          ) : sub.cancel_at_period_end ? (
            <>
              <p class="lede">Cancelled. You won't be charged again.</p>
              <p>You keep access {until ? `until ${until}` : "until the end of the month you've paid for"}.</p>
              <form method="post" action="/account/membership">
                <CsrfField token={props.csrfToken} />
                <input type="hidden" name="action" value="resume" />
                <button class="btn btn-ghost" type="submit">
                  Keep my membership after all
                </button>
              </form>
            </>
          ) : (
            <>
              <p class="lede">
                Active{price ? `: ${price} a month` : ""}.{until ? ` Next payment on ${until}.` : ""}
              </p>
              {sub.status === "past_due" && <p class="notice">Your last payment didn't go through. Stripe will try again; you can update your card from the link in Stripe's email.</p>}
              <details class="card">
                <summary>Cancel my membership</summary>
                <p>You won't be charged again, and you keep access until the end of the month you've paid for.</p>
                <form method="post" action="/account/membership">
                  <CsrfField token={props.csrfToken} />
                  <input type="hidden" name="action" value="cancel" />
                  <button class="btn btn-primary" type="submit">
                    Cancel membership
                  </button>
                </form>
              </details>
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
