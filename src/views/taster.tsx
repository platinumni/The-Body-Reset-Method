import { TASTER, TASTER_SAFETY } from "../content/taster";
import { CsrfField, Layout, type PageMeta } from "./layout";

/** Free Method taster sign-up: three emails over three days, one foot exercise each. */
export function TasterPage(props: { meta: PageMeta; csrfToken: string }) {
  return (
    <Layout meta={props.meta}>
      <section class="hero">
        <div class="wrap narrow">
          <p class="eyebrow">Free · 3 days · 3 exercises</p>
          <h1>Try the method free, starting with your feet.</h1>
          <p class="lede">
            Three short emails over three days. Each one has a single exercise from Stage 1 of Lower Body Regeneration, and what to notice as you do it.
          </p>
          <form method="post" action="/subscribe" class="signup-form">
            <CsrfField token={props.csrfToken} />
            <input type="hidden" name="source" value="taster" />
            <div class="hp" aria-hidden="true">
              <label for="taster-website">Leave this empty</label>
              <input id="taster-website" name="website" type="text" tabindex={-1} autocomplete="off" />
            </div>
            <label for="taster-email" class="sr-only">
              Email address
            </label>
            <input id="taster-email" name="email" type="email" autocomplete="email" placeholder="Your email address" required />
            <button class="btn btn-primary" type="submit">
              Send me day 1
            </button>
          </form>
          <p class="small muted">
            We'll ask you to confirm by email. After the three days you'll get occasional news about programmes and guides. Unsubscribe in one click at any
            time. See our <a href="/legal/privacy">privacy policy</a>.
          </p>
        </div>
      </section>
      <section class="band band-quiet">
        <div class="wrap narrow">
          <header class="section-head">
            <h2>What you'll get</h2>
          </header>
          <ol class="kitchen-steps">
            {TASTER.map((d, i) => (
              <li class="card">
                <h3>
                  Day {i + 1}: {d.exercise}
                </h3>
                <p>{d.intro}</p>
              </li>
            ))}
          </ol>
          <p class="small muted">{TASTER_SAFETY}</p>
        </div>
      </section>
    </Layout>
  );
}
