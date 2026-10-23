import type { Guide } from "../content/guides";
import { RichText } from "../lib/markdown";
import { Button } from "./components";
import { Layout, type PageMeta } from "./layout";
import { SignupBox, type OfferCopy } from "./marketing";

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function GuidesIndexPage(props: { meta: PageMeta; guides: Guide[]; csrfToken: string; offer: OfferCopy }) {
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <p class="eyebrow">Free guides</p>
          <h1>Guides to moving from the ground up</h1>
          <p class="lede">Practical, plain-English guides on tension, gripping, your feet and the principles behind the method.</p>
        </div>
      </section>
      <section class="band band-tight">
        <div class="wrap">
          <ul class="guide-list">
            {props.guides.map((g) => (
              <li class="card guide-card">
                <p class="small muted">{g.readMinutes} minute read</p>
                <h2 class="h3">
                  <a href={`/guides/${g.slug}`}>{g.title}</a>
                </h2>
                <p>{g.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <SignupBox csrfToken={props.csrfToken} offer={props.offer} source="guides" />
    </Layout>
  );
}

export function GuidePage(props: { meta: PageMeta; guide: Guide; others: Guide[]; csrfToken: string; offer: OfferCopy }) {
  const g = props.guide;
  return (
    <Layout meta={props.meta}>
      <article>
        <header class="page-hero">
          <div class="wrap narrow">
            <nav class="breadcrumbs small" aria-label="Breadcrumb">
              <a href="/">Home</a> › <a href="/guides">Guides</a>
            </nav>
            <h1 class="article-title">{g.title}</h1>
            <p class="small muted">
              {longDate(g.published)} · {g.readMinutes} minute read
            </p>
          </div>
        </header>
        <div class="wrap narrow prose article-body">
          <RichText source={g.body} level={2} />
        </div>
      </article>
      <section class="band band-feature">
        <div class="wrap narrow center">
          <p class="eyebrow">Flagship programme</p>
          <h2>Lower Body Regeneration</h2>
          <p class="prose-lg">Starts with your feet, arches and toes, then works up through the calves, knees and hips, one layer at a time.</p>
          <Button href="/programmes/lower-body-regeneration">See what's inside</Button>
        </div>
      </section>
      {props.others.length > 0 && (
        <section class="band">
          <div class="wrap narrow">
            <h2 class="h3">More guides</h2>
            <ul>
              {props.others.map((o) => (
                <li>
                  <a href={`/guides/${o.slug}`}>{o.title}</a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <SignupBox csrfToken={props.csrfToken} offer={props.offer} source="guide" />
    </Layout>
  );
}
