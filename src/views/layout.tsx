import type { Child } from "hono/jsx";
import { CSRF_FIELD } from "../middleware/csrf";
import { assetUrl } from "../routes/assets";

export type PageMeta = {
  title: string;
  description: string;
  path: string; // canonical path, e.g. "/programmes/lower-body-regeneration"
  siteName: string;
  siteUrl: string;
  noindex?: boolean;
  isTestSite?: boolean;
  basketCount?: number;
  jsonLd?: Record<string, unknown>[];
};

const NAV = [
  { href: "/method", label: "The Method" },
  { href: "/programmes", label: "Programmes" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

const LEGAL = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/refunds", label: "Refunds" },
  { href: "/legal/health-disclaimer", label: "Health disclaimer" },
];

const isCurrent = (href: string, path: string) => path === href || path.startsWith(href + "/");

export function Layout(props: { meta: PageMeta; children: Child }) {
  const { meta } = props;
  const canonical = new URL(meta.path, meta.siteUrl).toString();
  const fullTitle = meta.path === "/" ? meta.title : `${meta.title} | ${meta.siteName}`;
  const navLinks = NAV.map((n) => (
    <a href={n.href} aria-current={isCurrent(n.href, meta.path) ? "page" : undefined}>
      {n.label}
    </a>
  ));
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
        <meta name="theme-color" content="#f4efe6" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#151b18" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href={assetUrl("/favicon.svg")} type="image/svg+xml" />
        <link rel="preload" href="/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin="" />
        <link rel="stylesheet" href={assetUrl("/styles.css")} />
        {meta.jsonLd?.map((ld) => (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
        ))}
      </head>
      <body>
        <a class="skip-link" href="#main">
          Skip to content
        </a>
        {meta.isTestSite && (
          <div class="test-banner" role="note">
            Test site: not live. Highlighted text is a placeholder awaiting the owner's wording.
          </div>
        )}
        <header class="site-header">
          <div class="wrap header-inner">
            <a class="brand" href="/" aria-label={`${meta.siteName} home`}>
              <span class="brand-mark" aria-hidden="true" />
              <span class="brand-name">
                The Body <em>Regeneration</em> Method
              </span>
            </a>
            <nav class="nav-desktop" aria-label="Main">
              {navLinks}
            </nav>
            {!!meta.basketCount && (
              <a class="basket-link" href="/basket" aria-label={`Basket, ${meta.basketCount} item${meta.basketCount === 1 ? "" : "s"}`}>
                Basket <span class="basket-count">{meta.basketCount}</span>
              </a>
            )}
            <details class="nav-mobile">
              <summary aria-label="Menu">
                <span class="burger" aria-hidden="true" />
              </summary>
              <nav aria-label="Main (mobile)">{navLinks}</nav>
            </details>
          </div>
        </header>
        <main id="main">{props.children}</main>
        <footer class="site-footer">
          <div class="wrap footer-inner">
            <div>
              <p class="footer-brand">{meta.siteName}</p>
              <p class="small">Education and movement coaching. Not medical advice, diagnosis or treatment.</p>
            </div>
            <nav aria-label="Footer">
              <ul class="footer-links">
                {[...NAV, ...LEGAL].map((n) => (
                  <li>
                    <a href={n.href}>{n.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <p class="wrap small copyright">
            © {new Date().getFullYear()} {meta.siteName}
          </p>
        </footer>
      </body>
    </html>
  );
}

/** Hidden CSRF field — include inside every POST form. */
export const CsrfField = (props: { token: string }) => <input type="hidden" name={CSRF_FIELD} value={props.token} />;
