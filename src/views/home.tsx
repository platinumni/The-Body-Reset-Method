import { FOUNDATION, WHY, type Principle } from "../content/site";
import type { CatalogueEntry } from "../services/catalogue";
import { Button, ForNotFor, GroundUp, PrinciplesGrid, SectionHead, Text } from "./components";
import { Layout, type PageMeta } from "./layout";

export function HomePage(props: { meta: PageMeta; headline: string[]; lede: string; trackRecord: string; principles: Principle[]; programmes: CatalogueEntry[]; whoFor: string[]; notFor: string[] }) {
  const flagship = props.programmes.find((p) => p.flagship);
  const others = props.programmes.filter((p) => !p.flagship);
  return (
    <Layout meta={props.meta}>
      <section class="hero">
        <div class="wrap hero-inner">
          <p class="eyebrow">The Body Regeneration Method</p>
          <h1>
            {props.headline.map((line, i) => (
              <span class={`hero-line hero-line-${i + 1}`}>{line}</span>
            ))}
          </h1>
          <p class="lede">{props.lede}</p>
          <p class="track-record">{props.trackRecord}</p>
          <div class="actions">
            {flagship && <Button href={`/programmes/${flagship.slug}`}>Explore Lower Body Regeneration</Button>}
            <Button href="/method" variant="ghost">
              The six principles
            </Button>
          </div>
        </div>
      </section>

      <section class="band band-quiet">
        <div class="wrap narrow">
          <SectionHead eyebrow="The philosophy" title={WHY.title} />
          {WHY.paragraphs.map((p) => (
            <p class="prose-lg">{p}</p>
          ))}
        </div>
      </section>

      <section class="band" aria-labelledby="principles-title">
        <div class="wrap">
          <SectionHead
            eyebrow="The method"
            id="principles-title"
            title="Six principles, one direction"
            intro="Every programme follows the same six principles, in the same order, with each one building on the last."
          />
          <PrinciplesGrid principles={props.principles} />
          <p class="center">
            <a href="/method">More about the method →</a>
          </p>
        </div>
      </section>

      {flagship?.stages && (
        <section class="band band-feature" aria-labelledby="flagship-title">
          <div class="wrap split">
            <div>
              <SectionHead eyebrow="Flagship programme" id="flagship-title" title={flagship.title} intro={FOUNDATION.title} />
              {FOUNDATION.paragraphs.map((p) => (
                <p>{p}</p>
              ))}
              <p class="price-line">
                <Text copy={flagship.displayPrice} />
              </p>
              <Button href={`/programmes/${flagship.slug}`}>See what's inside</Button>
            </div>
            <GroundUp stages={[...flagship.stages]} />
          </div>
        </section>
      )}

      <section class="band" aria-labelledby="for-title">
        <div class="wrap">
          <SectionHead eyebrow="Is it for you?" id="for-title" title="Who the method is for" />
          <ForNotFor forList={props.whoFor} notFor={props.notFor} />
        </div>
      </section>

      <section class="band band-quiet" aria-labelledby="more-title">
        <div class="wrap">
          <SectionHead eyebrow="Coming soon" id="more-title" title="More programmes on the way" intro="Each one is built on the same six principles." />
          <ul class="programme-chips">
            {others.map((p) => (
              <li>
                <strong>{p.title}</strong>
                <span>{p.short}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section class="band cta">
        <div class="wrap narrow center">
          <h2>Learn to love your body again.</h2>
          <p class="prose-lg">Release what you've been holding on to, and rebuild from the ground up.</p>
          {flagship && <Button href={`/programmes/${flagship.slug}`}>Explore {flagship.title}</Button>}
        </div>
      </section>
    </Layout>
  );
}
