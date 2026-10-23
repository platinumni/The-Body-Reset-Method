import { Layout, type PageMeta } from "./layout";

export function NotFoundPage(props: { meta: PageMeta }) {
  return (
    <Layout meta={props.meta}>
      <section class="message">
        <h1>Page not found</h1>
        <p>That page doesn't exist or has moved.</p>
        <p>
          <a href="/">Go to the homepage</a>
        </p>
      </section>
    </Layout>
  );
}

export function ServerErrorPage(props: { meta: PageMeta }) {
  return (
    <Layout meta={props.meta}>
      <section class="message">
        <h1>Something went wrong</h1>
        <p>Sorry, that didn't work. Please try again in a moment.</p>
      </section>
    </Layout>
  );
}
