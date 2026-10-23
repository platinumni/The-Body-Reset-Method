import type { Child } from "hono/jsx";
import { CSRF_FIELD } from "../middleware/csrf";

export type PageMeta = {
  title: string;
  description: string;
  path: string; // canonical path, e.g. "/programmes/lower-body"
  siteName: string;
  siteUrl: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
};

export function Layout(props: { meta: PageMeta; children: Child }) {
  const { meta } = props;
  const canonical = new URL(meta.path, meta.siteUrl).toString();
  const fullTitle = meta.path === "/" ? meta.title : `${meta.title} | ${meta.siteName}`;
  return (
    <html lang="en-GB">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={canonical} />
        {meta.noindex && <meta name="robots" content="noindex, nofollow" />}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={meta.siteName} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content={canonical} />
        <meta name="theme-color" content="#1f2a24" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/styles.css" />
        {meta.jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c") }} />}
      </head>
      <body>
        <a class="skip-link" href="#main">Skip to content</a>
        <header class="site-header">
          <a class="brand" href="/">{meta.siteName}</a>
        </header>
        <main id="main">{props.children}</main>
        <footer class="site-footer">
          <p>
            © {new Date().getFullYear()} {meta.siteName}. Education and movement coaching, not medical advice.
          </p>
        </footer>
      </body>
    </html>
  );
}

/** Hidden CSRF field — include inside every POST form. */
export const CsrfField = (props: { token: string }) => <input type="hidden" name={CSRF_FIELD} value={props.token} />;
