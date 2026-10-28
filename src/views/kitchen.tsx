import { CHECKOUT_CONSENTS, MEMBERSHIP_CONSENTS } from "../content/consents";
import type { CatalogueEntry } from "../services/catalogue";
import { friendJoinPence as friendJoin } from "../services/kitchen-friends";
import { formatPrice } from "../services/products";
import { DAYS, money, type Plan } from "../lib/meal-plans/planner";
import { placeholder } from "../content/site";
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
              In the UK, from the typical prices the Office for National Statistics recorded in shops across the country, for your region, brought up to
              date each month with the official food price index{props.priceSource ? ` (${props.priceSource})` : ""}. In the US and Canada, from official
              monthly average prices. They're adjusted for the kind of supermarket you use. For anything without an official price, we use our own estimate,
              kept in line with official food price changes. Your local shop may differ, and you can tell us what you actually paid to make your plans more
              accurate.
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
            <JoinForm csrfToken={props.csrfToken} />
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

/** The Kitchen join form. With a friend's code it also asks for the email the offer is for. */
function JoinForm(props: { csrfToken: string; friend?: { code: string; email?: string } }) {
  return (
    <form method="post" action="/kitchen/join" class="card">
      <CsrfField token={props.csrfToken} />
      {props.friend && (
        <>
          <input type="hidden" name="friend" value={props.friend.code} />
          <div class="field">
            <label for="kj-email">Your email</label>
            <input id="kj-email" name="email" type="email" autocomplete="email" required value={props.friend.email ?? ""} />
            <p class="small muted">The friend offer is for new members. You'll pay with this email.</p>
          </div>
        </>
      )}
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
      {!props.friend && (
        <div class="field">
          <label for="kj-ref">Recommended by a member? Their code (optional)</label>
          <input id="kj-ref" name="ref" type="text" maxlength={12} autocomplete="off" />
        </div>
      )}
      <button class="btn btn-primary" type="submit">
        Continue to secure payment
      </button>
      <p class="small muted">Payments are handled by Stripe. We never see your card details.</p>
    </form>
  );
}

/** A Kitchen member's invite: half off the joining fee for a new member. */
export function FriendInvitePage(props: {
  meta: PageMeta;
  csrfToken: string;
  code: string;
  inviter: string | null;
  price: { join: number; monthly: number; currency: string } | null;
  email?: string;
  error?: string | null;
}) {
  const p = props.price;
  const who = props.inviter ?? "A friend";
  return (
    <Layout meta={props.meta}>
      <section class="hero kitchen-hero">
        <div class="wrap narrow">
          <p class="eyebrow">Body Regeneration Kitchen · part of The Body Regeneration Method</p>
          <h1>{who} invited you to the Kitchen.</h1>
          <p class="lede">A healthy week of meals for your budget, to the pound, with the recipes and a shopping list for your household.</p>
          {p ? (
            <p class="price-line large">
              {p.join > 0 ? (
                <>
                  Join for {formatPrice(friendJoin(p.join), p.currency)} with this invite (normally {formatPrice(p.join, p.currency)}), then {formatPrice(p.monthly, p.currency)} a month.
                </>
              ) : (
                <>{formatPrice(p.monthly, p.currency)} a month.</>
              )}
            </p>
          ) : (
            <p class="notice">The Kitchen opens soon. Keep this link: the offer will be here when it does.</p>
          )}
          <p>
            <a href="/kitchen">See what's in the Kitchen</a> · <a href="/kitchen/free-week">Try a free week first</a>
          </p>
        </div>
      </section>
      {p && (
        <section class="band band-quiet" id="join">
          <div class="wrap narrow">
            <header class="section-head">
              <h2>Join with {props.inviter ? `${props.inviter}'s` : "your friend's"} invite</h2>
              <p>
                You pay {formatPrice(friendJoin(p.join) + p.monthly, p.currency)} today (the joining fee and your first month), then {formatPrice(p.monthly, p.currency)} every month until you cancel. Cancel any time in
                your account, in two clicks.
              </p>
            </header>
            {props.error && (
              <p class="form-errors" role="alert">
                {props.error}
              </p>
            )}
            <JoinForm csrfToken={props.csrfToken} friend={{ code: props.code, email: props.email }} />
          </div>
        </section>
      )}
    </Layout>
  );
}

/** Body Regeneration Kitchen for organisations: housing associations, councils, charities and employers give their people free access with a partner code. */
export function KitchenPartnersPage(props: { meta: PageMeta }) {
  return (
    <Layout meta={props.meta}>
      <section class="hero kitchen-hero">
        <div class="wrap narrow">
          <p class="eyebrow">Body Regeneration Kitchen · for organisations</p>
          <h1>Help the people you support eat well on a tight budget.</h1>
          <p class="lede">
            Give your tenants, residents, clients or staff free access to Body Regeneration Kitchen. They tell it their weekly food budget and household, and
            get a week of meals that fits, with the recipes and a shopping list, priced with official UK food prices.
          </p>
          <div class="hero-buy">
            <a class="btn btn-primary" href="/contact?about=partners">
              Talk to us about a partnership
            </a>
            <a class="btn btn-ghost" href="/kitchen/free-week">
              Try a free week yourself
            </a>
          </div>
        </div>
      </section>

      <section class="band">
        <div class="wrap">
          <header class="section-head">
            <h2>Who it's for</h2>
          </header>
          <ul class="kitchen-steps">
            <li class="card">
              <h3>Housing associations and councils</h3>
              <p>A practical cost-of-living offer for tenants and residents, alongside your money and wellbeing advice.</p>
            </li>
            <li class="card">
              <h3>Food support and advice charities</h3>
              <p>Something to hand people once the crisis has passed: a way to plan a week's food on what they have.</p>
            </li>
            <li class="card">
              <h3>Employers</h3>
              <p>A wellbeing benefit that helps with the weekly shop, for staff and their families.</p>
            </li>
          </ul>
        </div>
      </section>

      <section class="band band-quiet">
        <div class="wrap narrow">
          <header class="section-head">
            <h2>What your people get</h2>
          </header>
          <ul>
            <li>A week of breakfasts, lunches, evening meals and snacks for any budget, to the pound, for their household (adults and children's ages).</li>
            <li>A shopping list split into what to buy and what's already in the cupboard, with estimated costs, and simple recipes.</li>
            <li>Prices based on official UK shop prices by region, updated monthly. They're estimates: we always say actual prices vary.</li>
            <li>Filters for vegetarian, vegan and foods they don't eat, and for the 14 main allergens (always check labels).</li>
            <li>A fresh plan every week, a printable PDF, and it works on any phone. No app to download.</li>
          </ul>
          <p class="small muted">
            It's general healthy eating on a budget: every plan is for keeping weight steady, and it isn't medical or dietary advice. It's built on clear
            rules, not AI.
          </p>
        </div>
      </section>

      <section class="band">
        <div class="wrap">
          <header class="section-head">
            <h2>How a partnership works</h2>
          </header>
          <ol class="kitchen-steps">
            <li class="card">
              <h3>1. We set up your code</h3>
              <p>You get your own partner code and a link to share by email, text, newsletter or a printed leaflet.</p>
            </li>
            <li class="card">
              <h3>2. People join free</h3>
              <p>They enter their email and the code. No card, no cost to them. You choose how many places.</p>
            </li>
            <li class="card">
              <h3>3. You see the take-up</h3>
              <p>Each month: how many have joined and how many used it in the last 30 days. Numbers only: we never share anyone's details with you.</p>
            </li>
          </ol>
          <p class="center">
            <Text copy={placeholder("Partner pricing, e.g. a monthly fee per organisation or per place")} />
          </p>
        </div>
      </section>

      <section class="band band-quiet">
        <div class="wrap narrow center">
          <h2>Let's talk</h2>
          <p>Tell us a little about your organisation and the people you support, and we'll set up a free trial code so your team can try it first.</p>
          <a class="btn btn-primary" href="/contact?about=partners">
            Get in touch
          </a>
          <p class="small muted">
            Body Regeneration Kitchen is part of <a href="/">The Body Regeneration Method</a>.
          </p>
        </div>
      </section>
    </Layout>
  );
}
