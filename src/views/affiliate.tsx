import type { Affiliate, AffiliateSummary } from "../services/affiliates";
import { formatPrice } from "../services/products";
import { CsrfField } from "./layout";

/** The "Earn by sharing" card on the member's account page. */
export function AffiliateCard(props: {
  csrfToken: string;
  ratePercent: number | null;
  holdDays: number;
  affiliate: Affiliate | null;
  summary: AffiliateSummary | null;
  link: string | null;
  ownsProgramme: boolean;
}) {
  const { affiliate, summary } = props;
  if (props.ratePercent == null) {
    return (
      <div class="card" id="share">
        <h2 class="h3">Earn by sharing</h2>
        <p>Our member referral programme is opening soon. We'll let you know when it does.</p>
      </div>
    );
  }
  if (!affiliate) {
    return (
      <div class="card" id="share">
        <h2 class="h3">Earn by sharing</h2>
        <p>
          Recommend the method to friends and earn <strong>{props.ratePercent}%</strong> of every purchase made through your personal link.
        </p>
        {props.ownsProgramme ? (
          <form method="post" action="/account/affiliate/join">
            <CsrfField token={props.csrfToken} />
            <label class="confirm-check">
              <input type="checkbox" name="terms" value="yes" required /> I agree to the{" "}
              <a href="/legal/affiliate-terms" target="_blank" rel="noopener">
                affiliate terms
              </a>
              , including labelling posts as ads.
            </label>
            <button class="btn btn-primary btn-small" type="submit">
              Get my share link
            </button>
          </form>
        ) : (
          <p class="small muted">Available once you've bought a programme.</p>
        )}
      </div>
    );
  }
  if (affiliate.status === "suspended") {
    return (
      <div class="card" id="share">
        <h2 class="h3">Earn by sharing</h2>
        <p>Your share link is paused. Please get in touch if you think this is a mistake.</p>
      </div>
    );
  }
  return (
    <div class="card" id="share">
      <h2 class="h3">Earn by sharing</h2>
      <p class="small muted">Your personal link:</p>
      <p class="share-link">
        <code>{props.link}</code>
      </p>
      <p class="small">
        Your code for checkout: <strong>{affiliate.code}</strong>
      </p>
      {summary && (
        <ul class="affiliate-stats">
          <li>
            <strong>{summary.clicks}</strong>
            <span>link visits</span>
          </li>
          <li>
            <strong>{summary.sales}</strong>
            <span>sales</span>
          </li>
          <li>
            <strong>{formatPrice(summary.pending)}</strong>
            <span>on hold</span>
          </li>
          <li>
            <strong>{formatPrice(summary.approved)}</strong>
            <span>owed to you</span>
          </li>
          <li>
            <strong>{formatPrice(summary.paid)}</strong>
            <span>paid so far</span>
          </li>
        </ul>
      )}
      <p class="small muted">
        You earn {props.ratePercent}% of each sale. Commission is held for {props.holdDays} days in case of refunds, then paid monthly.
      </p>
      <aside class="key-point">
        <span class="key-point-label">When you share</span>
        <p>
          Say you earn from it, e.g. add <strong>#ad</strong> or "I earn commission from this link". Share your own experience, and please don't promise
          health results or medical benefits.
        </p>
      </aside>
      <form method="post" action="/account/affiliate/payout">
        <CsrfField token={props.csrfToken} />
        <div class="field">
          <label for="payout_email">Where should we send your commission? (PayPal email)</label>
          <input id="payout_email" name="payout_email" type="email" value={affiliate.payout_email ?? ""} />
        </div>
        <button class="btn btn-ghost btn-small" type="submit">
          Save
        </button>
      </form>
    </div>
  );
}
