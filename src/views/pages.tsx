import { FOUNDATION, WHY, type Copy, type Faq, type Principle } from "../content/site";
import type { CatalogueEntry } from "../services/catalogue";
import { Button, ForNotFor, GroundUp, PrinciplesGrid, SectionHead, Text } from "./components";
import { CsrfField, Layout, type PageMeta } from "./layout";

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

export function ProgrammePage(props: { meta: PageMeta; programme: CatalogueEntry; whoFor: string[]; notFor: string[]; csrfToken: string; inBasket: boolean; trackRecord: string }) {
  const p = props.programme;
  return (
    <Layout meta={props.meta}>
      <PageHero eyebrow={p.flagship ? "Flagship programme" : "Programme"} title={p.title} lede={p.short} />
      {p.flagship && (
        <div class="wrap narrow">
          <p class="track-record">{props.trackRecord}</p>
        </div>
      )}
      {p.stages && (
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
