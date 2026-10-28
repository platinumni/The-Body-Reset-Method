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
export type FriendBox = { code: string; url: string; showName: boolean; pending: number; counted: number; reward: "year" | "lifetime" | null; joinPence: number | null };

export function MembershipPage(props: {
  meta: PageMeta;
  csrfToken: string;
  sub: Subscription | null;
  monthly: { monthly_pence: number | null; currency: string } | null;
  done: string | null;
  friends?: FriendBox | null;
}) {
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
      {props.friends && <Friends f={props.friends} currency={props.monthly?.currency ?? "gbp"} csrfToken={props.csrfToken} />}
    </Layout>
  );
}

/** Refer-a-friend: the member's invite link and how they're getting on. */
function Friends(props: { f: FriendBox; currency: string; csrfToken: string }) {
  const { f } = props;
  const offer = f.joinPence ? `join for ${formatPrice(Math.floor(f.joinPence / 2), props.currency)} with my invite (normally ${formatPrice(f.joinPence, props.currency)})` : "join with half off the joining fee with my invite";
  const progress =
    f.reward === "lifetime"
      ? "Two friends joined: your membership is free for life. Thank you!"
      : f.reward === "year"
        ? "A friend joined: your next 12 months are free. One more friend makes it free for life."
        : f.pending
          ? `${f.pending === 1 ? "A friend has" : `${f.pending} friends have`} joined. It counts 14 days after they join.`
          : "No friends have joined yet.";
  return (
    <section class="band band-quiet" id="friends">
      <div class="wrap narrow">
        <h2 class="h3">Share the Kitchen with friends and family</h2>
        <p>
          Friends get half off the joining fee. When <strong>1 friend</strong> joins with your link, you get <strong>a year free</strong>. When <strong>2 friends</strong> join, it's{" "}
          <strong>free for life</strong>.
        </p>
        <div class="card">
          <p>
            Your invite link: <a href={f.url}>{f.url}</a>
          </p>
          <p class="small muted">Something to send: "I use Body Regeneration Kitchen for our weekly meals. You can {offer}: {f.url}"</p>
          <p role="status">{progress}</p>
          <form method="post" action="/account/membership/friend-name">
            <CsrfField token={props.csrfToken} />
            <input type="hidden" name="show" value={f.showName ? "no" : "yes"} />
            <p class="small">
              Your invite page says {f.showName ? "your first name" : '"A friend"'}.{" "}
              <button class="btn btn-ghost btn-small" type="submit">
                {f.showName ? 'Say "A friend" instead' : "Show my first name"}
              </button>
            </p>
          </form>
          <p class="small muted">
            Friends must be new to the Kitchen. A friend counts once they've been a member for 14 days and haven't had a refund. See the <a href="/legal/terms#friends">terms</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
