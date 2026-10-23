import { Layout, type PageMeta } from "./layout";

// Holding homepage for the foundation step. The full design comes in Step 2.
// Wording is drawn from the owner's own description of the philosophy; no claims or figures.
export function HomePage(props: { meta: PageMeta }) {
  return (
    <Layout meta={props.meta}>
      <section class="hero">
        <p class="eyebrow">Coming soon</p>
        <h1>
          Release the tension.
          <br />
          Stop forcing.
          <br />
          Learn to trust your body again.
        </h1>
        <p class="lede">
          A ground-up approach to movement, starting with your feet. The flagship Lower Body programme works up from your
          arches and toes to your calves, knees and hips.
        </p>
      </section>
    </Layout>
  );
}
