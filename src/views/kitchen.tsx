import { CHECKOUT_CONSENTS, MEMBERSHIP_CONSENTS } from "../content/consents";
import type { CatalogueEntry } from "../services/catalogue";
import { formatPrice } from "../services/products";
import { DAYS, money, type Plan } from "../lib/meal-plans/planner";
import { Text } from "./components";
import { CsrfField, Layout, type PageMeta } from "./layout";
import { TrustStrip } from "./marketing";

const MEAL_LABELS: Record<string, string> = { Breakfasts: "Breakfast", Lunches: "Lunch", "Evening meals": "Evening meal", Snacks: "Snack" };

/** Body Regeneration Kitchen: the meal plans' own landing page, sold through the main site's checkout. */
export function KitchenPage(props: { meta: PageMeta; csrfToken: string; product: CatalogueEntry; inBasket: boolean; sample: Plan; priceSource: string | null; notice?: string | null }) {
  const p = props.product;
  const membership = p.onSale && p.product?.monthly_pence != null ? { join: p.product.price_pence!, monthly: p.product.monthly_pence, currency: p.product.currency } : null;
  const s = props.sample;
  return (
    <Layout meta={props.meta}>
      <section class="hero kitchen-hero">
        <div class="wrap narrow">
          <p class="eyebrow">Body Regeneration Kitchen · part of The Body Regeneration Method</p>
          <h1>A healthy week of meals, for your budget, to the pound.</h1>
          <p class="lede">
            Tell us your weekly budget and who you're feeding. We'll build a week of simple, healthy meals that fits, with the recipes and a shopping list,
            priced with up-to-date official food prices.
          </p>
          <div class="hero-buy">
            {membership ? (
              <p class="price-line large">
                {membership.join > 0 ? `${formatPrice(membership.join, membership.currency)} to join, then ` : ""}
                {formatPrice(membership.monthly, membership.currency)} a month
              </p>
            ) : (
              <p class="price-line large">
                <Text copy={p.displayPrice} />
              </p>
            )}
            {membership ? (
              <a class="btn btn-primary" href="#join">
                Join Body Regeneration Kitchen
              </a>
            ) : p.onSale ? (
              props.inBasket ? (
                <a class="btn btn-primary" href="/basket">
                  In your basket: view basket
                </a>
              ) : (
                <form method="post" action="/basket/add">
                  <CsrfField token={props.csrfToken} />
                  <input type="hidden" name="slug" value={p.slug} />
                  <button class="btn btn-primary" type="submit">
                    Get Budget Meal Plans
                  </button>
                </form>
              )
            ) : (
              <p class="notice">Coming soon.</p>
            )}
            <a class="btn btn-ghost" href="/kitchen/free-week">
              Try a free week
            </a>
          </div>
          <TrustStrip guarantee={false} />
        </div>
      </section>

      <section class="band">
        <div class="wrap">
          <header class="section-head">
            <h2>How it works</h2>
          </header>
          <ol class="kitchen-steps">
            <li class="card">
              <h3>1. Set your budget</h3>
              <p>Any amount, from £20 to £100 or more. Add your household, foods you don't eat and any allergies.</p>
            </li>
            <li class="card">
              <h3>2. Get your week</h3>
              <p>Breakfast, lunch, evening meal and snacks for seven days, with batch-cooking and leftovers on tighter budgets.</p>
            </li>
            <li class="card">
              <h3>3. Shop and cook</h3>
              <p>A shopping list with estimated costs, tick off what's in your cupboard, and simple recipes. Download it as a PDF.</p>
            </li>
          </ol>
        </div>
      </section>

      <section class="band band-quiet">
        <div class="wrap narrow">
          <header class="section-head">
            <h2>A sample week for one adult, on £30</h2>
            <p>
              Estimated {money(s.weeklyCost, "uk")} at a mid-range supermarket. Members choose their own budget, household and leave-outs, and can swap any
              meal.
            </p>
          </header>
          <ol class="week">
            {DAYS.slice(0, 3).map((day, d) => (
              <li class="day card">
                <h3>{day}</h3>
                <ul>
                  {s.slots
                    .filter((x) => x.day === d)
                    .map((x) => (
                      <li>
                        <span class="meal-label">{MEAL_LABELS[x.meal]}</span> {x.recipe.name}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
          <p class="small muted">…and the rest of the week, with every recipe and the full shopping list.</p>
          <p>
            <a class="btn btn-primary" href="/kitchen/free-week">
              See your own week free
            </a>
          </p>
        </div>
      </section>

      <section class="band">
        <div class="wrap narrow">
          <header class="section-head">
            <h2>What's inside</h2>
          </header>
          <ul class="ticks large">
            {(p.includes ?? []).map((i) => (
              <li>
                <Text copy={i} />
              </li>
            ))}
          </ul>
          {p.access && (
            <p>
              <strong>Access:</strong> <Text copy={p.access} />
            </p>
          )}
        </div>
      </section>

      <section class="band band-quiet">
        <div class="wrap narrow">
          <header class="section-head">
            <h2>Good to know</h2>
          </header>
          <details class="faq">
            <summary>Where do the prices come from?</summary>
            <p>
              From official national average food prices{props.priceSource ? ` (${props.priceSource})` : ""}, updated monthly, adjusted for the kind of
              supermarket you use. For anything without an official average, we use our own estimate, kept up to date with official food price changes.
              They're averages, so your local shop may differ, and you can tell us what you actually paid to make your plans more accurate.
            </p>
          </details>
          <details class="faq">
            <summary>Is this a diet?</summary>
            <p>
              No. It's general healthy eating, designed to maintain your weight. If you want to gain or lose weight, or have a medical condition, speak to
              your GP, a registered dietitian or a registered nutritionist.
            </p>
          </details>
          <details class="faq">
            <summary>What about allergies?</summary>
            <p>
              You can leave out any of the 14 main allergens, and recipes containing them are removed from your plan. Brands differ, so always check
              product labels too.
            </p>
          </details>
          <details class="faq">
            <summary>Can I get a refund?</summary>
            <p>
              The Kitchen isn't covered by our 90-day guarantee, and you get access straight away. You can cancel any time and won't be charged again. If
              something isn't working, <a href="/contact">get in touch</a>.
            </p>
          </details>
        </div>
      </section>

      {membership && (
        <section class="band band-quiet" id="join">
          <div class="wrap narrow">
            <header class="section-head">
              <h2>Join Body Regeneration Kitchen</h2>
              <p>
                {membership.join > 0
                  ? `You pay ${formatPrice(membership.join + membership.monthly, membership.currency)} today (the ${formatPrice(membership.join, membership.currency)} joining fee and your first month), then ${formatPrice(membership.monthly, membership.currency)} every month until you cancel.`
                  : `${formatPrice(membership.monthly, membership.currency)} every month until you cancel.`}{" "}
                Cancel any time in your account, in two clicks. You keep access until the end of the month you've paid for.
              </p>
            </header>
            {props.notice && (
              <p class="form-errors" role="alert">
                {props.notice}
              </p>
            )}
            <form method="post" action="/kitchen/join" class="card">
              <CsrfField token={props.csrfToken} />
              {MEMBERSHIP_CONSENTS.map((k) => (
                <div class="check">
                  <input type="checkbox" id={`kj-${k}`} name={k} value="yes" required />
                  <label for={`kj-${k}`}>
                    {CHECKOUT_CONSENTS[k].label}
                    {k === "terms" && (
                      <>
                        {" "}
                        <a href="/legal/terms" target="_blank" rel="noopener">
                          Read the terms
                        </a>
                      </>
                    )}
                  </label>
                </div>
              ))}
              <div class="field">
                <label for="kj-ref">Recommended by a member? Their code (optional)</label>
                <input id="kj-ref" name="ref" type="text" maxlength={12} autocomplete="off" />
              </div>
              <button class="btn btn-primary" type="submit">
                Continue to secure payment
              </button>
              <p class="small muted">Payments are handled by Stripe. We never see your card details.</p>
            </form>
          </div>
        </section>
      )}

      <section class="band" id="signup">
        <div class="wrap narrow center">
          <p class="small muted">
            From the makers of <a href="/">The Body Regeneration Method</a>: movement programmes that help you release tension and move freely.
          </p>
        </div>
      </section>
    </Layout>
  );
}
