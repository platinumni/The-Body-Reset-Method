import { EFFORTLESS, FLAGSHIP_POINTER, FOUNDATION, LEARNING_STAGES, PRINCIPLES_DEPTH, WHY, type Copy, type Faq, type Principle } from "../content/site";
import type { CatalogueEntry } from "../services/catalogue";
import { Button, ForNotFor, GroundUp, PrinciplesGrid, SectionHead, Text } from "./components";
import { CsrfField, Layout, type PageMeta } from "./layout";
import { HowItWorks, IS_THIS_YOU, SignupBox, StickyBuy, Testimonials, TrustStrip, type OfferCopy } from "./marketing";
import type { Testimonial } from "../services/site-content";

function PageHero(props: { eyebrow: string; title: string; lede?: string }) {
  return (
    <section class="page-hero">
      <div class="wrap narrow">
        <p class="eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
        {props.lede && <p class="lede">{props.lede}</p>}
      </div>
    </section>
  );
}

export function MethodPage(props: { meta: PageMeta; principles: Principle[] }) {
  return (
    <Layout meta={props.meta}>
      <PageHero
        eyebrow="The method"
        title="Release first, then rebuild"
        lede="Most training asks you to add more effort. This method starts by taking away the effort you don't need: the tension, the gripping, the forcing and the constant need for control."
      />
      <section class="band band-quiet">
        <div class="wrap narrow">
          <SectionHead title={WHY.title} />
          {WHY.paragraphs.map((p) => (
            <p class="prose-lg">{p}</p>
          ))}
        </div>
      </section>
      <section class="band">
        <div class="wrap">
          <SectionHead title="The six principles" intro="Every programme moves through the same six principles, in this order." />
          <PrinciplesGrid principles={props.principles} />
        </div>
      </section>
      <section class="band band-quiet">
        <div class="wrap narrow">
          <SectionHead title="The principles in more depth" />
          {PRINCIPLES_DEPTH.map((d) => (
            <div class="depth">
              <h3>{d.title}</h3>
              {d.paragraphs.map((p) => (
                <p class="prose-lg">{p}</p>
              ))}
            </div>
          ))}
        </div>
      </section>
      <section class="band">
        <div class="wrap narrow">
          <SectionHead title="Engage, but don't grip" />
          {EFFORTLESS.map((p) => (
            <p class="prose-lg">{p}</p>
          ))}
        </div>
      </section>
      <section class="band band-quiet">
        <div class="wrap narrow">
          <SectionHead title="The four stages of learning" intro="Every new skill passes through four stages. The programmes are built to walk you through all of them." />
          <ol class="learning-stages">
            {LEARNING_STAGES.map((s) => (
              <li>
                <strong>{s.title}</strong>
                <span>{s.summary}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section class="band">
        <div class="wrap narrow">
          <SectionHead title="Why the order matters" />
          <p class="prose-lg">
            Strength built on top of tension and compensation simply makes the compensation stronger. So the method begins with awareness and release.
            It then reconnects you with how your body actually feels and moves, and only then builds strength. The final step takes those changes out
            into everyday life and into more demanding activity.
          </p>
          <p class="prose-lg">The full teaching behind each principle, and how to apply it, is inside the programmes.</p>
          <Button href="/programmes">See the programmes</Button>
        </div>
      </section>
    </Layout>
  );
}

export function ProgrammesPage(props: { meta: PageMeta; programmes: CatalogueEntry[] }) {
  return (
    <Layout meta={props.meta}>
      <PageHero eyebrow="Programmes" title="Start from the ground up" lede="Begin with the flagship. Further programmes build on it." />
      <section class="band">
        <div class="wrap">
          <ul class="programme-list">
            {props.programmes.map((p) => (
              <li class={`card programme-card${p.flagship ? " is-flagship" : ""}`}>
                <p class="eyebrow">{p.flagship ? "Flagship" : p.status === "coming-soon" ? "Coming soon" : "Programme"}</p>
                <h2>{p.title}</h2>
                <p>{p.short}</p>
                {p.status === "available" ? (
                  <>
                    <p class="price-line">
                      <Text copy={p.displayPrice} />
                    </p>
                    <Button href={`/programmes/${p.slug}`}>See what's inside</Button>
                  </>
                ) : (
                  <p class="small muted">Not available yet.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Layout>
  );
}

export function ProgrammePage(props: { meta: PageMeta; programme: CatalogueEntry; whoFor: string[]; notFor: string[]; csrfToken: string; inBasket: boolean; trackRecord: string; testimonials: Testimonial[]; offer: OfferCopy; faqs: Faq[] }) {
  const p = props.programme;
  return (
    <Layout meta={props.meta}>
      <PageHero eyebrow={p.flagship ? "Flagship programme" : "Programme"} title={p.title} lede={p.short} />
      <div class="wrap narrow">
        {p.flagship && <p class="track-record">{props.trackRecord}</p>}
        <div class="hero-buy">
          <p class="price-line large">
            <Text copy={p.displayPrice} />
          </p>
          {p.onSale ? (
            props.inBasket ? (
              <Button href="/basket">In your basket: view basket</Button>
            ) : (
              <form method="post" action="/basket/add">
                <CsrfField token={props.csrfToken} />
                <input type="hidden" name="slug" value={p.slug} />
                <button class="btn btn-primary" type="submit">
                  Add to basket
                </button>
              </form>
            )
          ) : (
            <Button href="#signup">Get launch news</Button>
          )}
        </div>
        <TrustStrip />
        {!p.flagship && !p.food && (
          <aside class="card flagship-pointer">
            <h2 class="h3">{FLAGSHIP_POINTER.title}</h2>
            <p>{FLAGSHIP_POINTER.text}</p>
            <Button href="/programmes/lower-body-regeneration">See Lower Body Regeneration</Button>
          </aside>
        )}
      </div>
      {p.flagship && (
        <section class="band band-quiet">
          <div class="wrap narrow">
            <SectionHead eyebrow="Is this you?" title="If any of these sound familiar, this programme was made for you" />
            <ul class="ticks large">
              {IS_THIS_YOU.map((t) => (
                <li>{t}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {p.stages && !p.flagship && (
        <section class="band">
          <div class="wrap narrow">
            <SectionHead title="What you'll work through" intro="Each part builds on the one before it." />
            <ol class="learning-stages">
              {p.stages.map((s) => (
                <li>
                  <strong>{s.title}</strong>
                  <span>{s.summary}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
      {p.stages && p.flagship && (
        <section class="band">
          <div class="wrap split">
            <div>
              <SectionHead title={FOUNDATION.title} intro="Each stage builds on the one below it." />
              {FOUNDATION.paragraphs.map((p) => (
                <p>{p}</p>
              ))}
            </div>
            <GroundUp stages={p.stages} />
          </div>
        </section>
      )}
      {p.includes && (
        <section class="band band-quiet">
          <div class="wrap narrow">
            <SectionHead title="What's inside" />
            <ul class="ticks large">
              {p.includes.map((i) => (
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
      )}
      <Testimonials items={props.testimonials} />
      <section class="band">
        <div class="wrap">
          <SectionHead title="How it works" />
          <HowItWorks />
        </div>
      </section>
      <section class="band">
        <div class="wrap">
          <SectionHead title="Is it right for you?" />
          <ForNotFor forList={props.whoFor} notFor={props.notFor} />
        </div>
      </section>
      <section class="band cta">
        <div class="wrap narrow center">
          <h2>{p.title}</h2>
          <p class="price-line large">
            <Text copy={p.displayPrice} />
          </p>
          {p.onSale ? (
            props.inBasket ? (
              <Button href="/basket">In your basket: view basket</Button>
            ) : (
              <form method="post" action="/basket/add">
                <CsrfField token={props.csrfToken} />
                <input type="hidden" name="slug" value={p.slug} />
                <button class="btn btn-primary" type="submit">
                  Add to basket
                </button>
              </form>
            )
          ) : (
            <p class="btn btn-primary is-disabled" aria-disabled="true">
              Checkout opens soon
            </p>
          )}
          <p class="small muted">No account needed to buy. After payment we email you a link to set up your members' area.</p>
        </div>
      </section>
      <section class="band band-quiet">
        <div class="wrap narrow">
          <SectionHead title="Questions" />
          <div class="faqs">
            {props.faqs.slice(0, 4).map((f) => (
              <details class="faq">
                <summary>{f.q}</summary>
                {f.a.map((a) => (
                  <p>
                    <Text copy={a} />
                  </p>
                ))}
              </details>
            ))}
          </div>
          <p>
            <a href="/faq">All questions →</a>
          </p>
        </div>
      </section>
      <SignupBox csrfToken={props.csrfToken} offer={props.offer} source="programme" />
      <StickyBuy title={p.title} price={p.onSale && typeof p.displayPrice === "string" ? p.displayPrice : null} csrfToken={props.csrfToken} slug={p.slug} inBasket={props.inBasket} />
    </Layout>
  );
}

export function AboutPage(props: { meta: PageMeta; coachName: Copy; story: Copy[] }) {
  return (
    <Layout meta={props.meta}>
      <PageHero eyebrow="About" title="The coach behind the method" />
      <section class="band">
        <div class="wrap narrow prose">
          <h2>
            <Text copy={props.coachName} />
          </h2>
          {props.story.map((s) => (
            <p>
              <Text copy={s} />
            </p>
          ))}
          <p>
            <Button href="/method">Explore the method</Button>
          </p>
        </div>
      </section>
    </Layout>
  );
}

export function ContactPage(props: { meta: PageMeta; csrfToken: string; sent?: boolean; error?: string | null; values?: { name: string; email: string; message: string } }) {
  const v = props.values ?? { name: "", email: "", message: "" };
  return (
    <Layout meta={props.meta}>
      <PageHero eyebrow="Contact" title="Get in touch" lede="A question about the method or a programme? Send us a message and we'll reply by email." />
      <section class="band">
        <div class="wrap narrow">
          {props.sent ? (
            <p class="notice notice-ok" role="status">
              Thank you. Your message has been sent, and we'll reply by email.
            </p>
          ) : (
            <form method="post" action="/contact" class="card contact-form">
              <CsrfField token={props.csrfToken} />
              {props.error && (
                <p class="notice notice-error" role="alert">
                  {props.error}
                </p>
              )}
              <div class="field">
                <label for="c-name">Your name</label>
                <input id="c-name" name="name" type="text" required maxlength={100} autocomplete="name" value={v.name} />
              </div>
              <div class="field">
                <label for="c-email">Your email</label>
                <input id="c-email" name="email" type="email" required maxlength={254} autocomplete="email" value={v.email} />
              </div>
              <div class="field">
                <label for="c-message">Your message</label>
                <textarea id="c-message" name="message" rows={6} required maxlength={5000}>
                  {v.message}
                </textarea>
              </div>
              <div class="hp" aria-hidden="true">
                <label for="c-website">Leave this empty</label>
                <input id="c-website" name="website" type="text" tabindex={-1} autocomplete="off" />
              </div>
              <button class="btn btn-primary" type="submit">
                Send message
              </button>
              <p class="small muted">
                We use your details only to reply to you. See our <a href="/legal/privacy">privacy policy</a>. This is education and movement coaching, so we
                can't give personal medical advice.
              </p>
            </form>
          )}
        </div>
      </section>
    </Layout>
  );
}

export function FaqPage(props: { meta: PageMeta; faqs: Faq[] }) {
  return (
    <Layout meta={props.meta}>
      <PageHero eyebrow="Questions" title="Frequently asked questions" />
      <section class="band">
        <div class="wrap narrow">
          <div class="faqs">
            {props.faqs.map((f) => (
              <details class="faq">
                <summary>{f.q}</summary>
                {f.a.map((a) => (
                  <p>
                    <Text copy={a} />
                  </p>
                ))}
              </details>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
