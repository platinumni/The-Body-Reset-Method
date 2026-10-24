import type { Testimonial } from "../services/site-content";
import { CsrfField } from "./layout";

// Conversion building blocks used across the public pages.

export type OfferCopy = { headline: string; code: string | null; details: string | null } | null;

export function TrustStrip() {
  const items = ["Secure checkout with Stripe", "Instant access after payment", "Works on any phone, tablet or computer", "Learn at your own pace"];
  return (
    <ul class="trust-strip" aria-label="Why buy with confidence">
      {items.map((t) => (
        <li>{t}</li>
      ))}
    </ul>
  );
}

export function HowItWorks() {
  const steps = [
    { title: "Choose your programme", text: "Start with Lower Body Regeneration, the foundation for everything else. Add other programmes at checkout if you like." },
    { title: "Get instant access", text: "Pay securely, and we'll email you a link to create your account. Your programme is waiting there, on any device." },
    { title: "Start with the full guide", text: "Read it page by page to understand the philosophy, then train with Listen mode, the Key points or the one-page exercise sheet, at your own pace." },
  ];
  return (
    <ol class="how-steps">
      {steps.map((s, i) => (
        <li class="how-step">
          <span class="how-n" aria-hidden="true">
            {i + 1}
          </span>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function Testimonials(props: { items: Testimonial[] }) {
  if (!props.items.length) return null;
  return (
    <section class="band" aria-labelledby="testimonials-title">
      <div class="wrap">
        <header class="section-head">
          <p class="eyebrow">In their words</p>
          <h2 id="testimonials-title">What people say</h2>
        </header>
        <ul class="testimonials">
          {props.items.map((t) => (
            <li class="card testimonial">
              <blockquote>
                <p>"{t.quote}"</p>
              </blockquote>
              <p class="testimonial-who">{t.who}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SignupForm(props: { csrfToken: string; source: string; idPrefix: string; button: string }) {
  return (
    <form method="post" action="/subscribe" class="signup-form">
      <CsrfField token={props.csrfToken} />
      <input type="hidden" name="source" value={props.source} />
      {/* Hidden from people; bots tend to fill it in. */}
      <div class="hp" aria-hidden="true">
        <label for={`${props.idPrefix}-website`}>Leave this empty</label>
        <input id={`${props.idPrefix}-website`} name="website" type="text" tabindex={-1} autocomplete="off" />
      </div>
      <label for={`${props.idPrefix}-email`} class="sr-only">
        Email address
      </label>
      <input id={`${props.idPrefix}-email`} name="email" type="email" autocomplete="email" placeholder="Your email address" required />
      <button class="btn btn-primary" type="submit">
        {props.button}
      </button>
    </form>
  );
}

const signupTitle = (offer: OfferCopy) => offer?.headline ?? "Start with your feet";
const signupText = (offer: OfferCopy) =>
  offer
    ? "Join the list and we'll email you the code, plus new guides and programmes. No spam, and you can unsubscribe in one click."
    : "Get our free guides on releasing tension and moving from the ground up, plus news of new programmes. No spam, and you can unsubscribe in one click.";

/** Inline sign-up band (works without JavaScript). */
export function SignupBox(props: { csrfToken: string; offer: OfferCopy; source: string }) {
  return (
    <section class="band signup-band" id="signup" aria-labelledby={`signup-title-${props.source}`}>
      <div class="wrap narrow center">
        <p class="eyebrow">{props.offer ? "Offer for new members" : "Free guides"}</p>
        <h2 id={`signup-title-${props.source}`}>{signupTitle(props.offer)}</h2>
        <p class="prose-lg">{signupText(props.offer)}</p>
        <SignupForm csrfToken={props.csrfToken} source={props.source} idPrefix={`inline-${props.source}`} button={props.offer ? "Send me the code" : "Sign me up"} />
        {props.offer?.details && <p class="small muted">{props.offer.details}</p>}
        <p class="small muted">
          We'll ask you to confirm by email. See our <a href="/legal/privacy">privacy policy</a>.
        </p>
      </div>
    </section>
  );
}

/** Pop-up version, opened by /app.js after a while on the page (once per visitor). */
export function SignupDialog(props: { csrfToken: string; offer: OfferCopy }) {
  return (
    <dialog id="signup-dialog" class="signup-dialog" aria-labelledby="signup-dialog-title">
      <form method="dialog" class="dialog-close-form">
        <button class="dialog-close" type="submit" aria-label="Close">
          ×
        </button>
      </form>
      <p class="eyebrow">{props.offer ? "Offer for new members" : "Free guides"}</p>
      <h2 id="signup-dialog-title">{signupTitle(props.offer)}</h2>
      <p>{signupText(props.offer)}</p>
      <SignupForm csrfToken={props.csrfToken} source="popup" idPrefix="dialog" button={props.offer ? "Send me the code" : "Sign me up"} />
      {props.offer?.details && <p class="small muted">{props.offer.details}</p>}
    </dialog>
  );
}

/** Pinned "buy" bar on phones for the programme page. */
export function StickyBuy(props: { title: string; price: string | null; csrfToken: string; slug: string; inBasket: boolean }) {
  return (
    <div class="sticky-buy" role="region" aria-label="Buy">
      <div>
        <strong>{props.title}</strong>
        {props.price && <span>{props.price}</span>}
      </div>
      {props.price ? (
        props.inBasket ? (
          <a class="btn btn-primary btn-small" href="/basket">
            View basket
          </a>
        ) : (
          <form method="post" action="/basket/add">
            <CsrfField token={props.csrfToken} />
            <input type="hidden" name="slug" value={props.slug} />
            <button class="btn btn-primary btn-small" type="submit">
              Add to basket
            </button>
          </form>
        )
      ) : (
        <a class="btn btn-primary btn-small" href="#signup">
          Get launch news
        </a>
      )}
    </div>
  );
}

export const IS_THIS_YOU = [
  "You feel tight or \"held\" when you move, even after stretching.",
  "Your feet feel weak, stiff or flat, and nobody has ever shown you how to use them.",
  "You don't fully trust your balance on one leg or on uneven ground.",
  "You've trained hard for years, but movement still feels like forcing.",
  "You've tried other approaches without the lasting change you wanted.",
];
