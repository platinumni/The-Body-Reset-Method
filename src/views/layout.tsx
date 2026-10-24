import { raw } from "hono/html";
import type { Child } from "hono/jsx";
import { CSRF_FIELD } from "../middleware/csrf";
import { assetUrl } from "../routes/assets";
import { SignupDialog, type OfferCopy } from "./marketing";

export type PageMeta = {
  title: string;
  description: string;
  path: string; // canonical path, e.g. "/programmes/lower-body-regeneration"
  siteName: string;
  siteUrl: string;
  noindex?: boolean;
  isTestSite?: boolean;
  basketCount?: number;
  loggedIn?: boolean;
  ogType?: "website" | "article";
  /** Set on marketing pages: renders the sign-up pop-up (opened by /app.js). */
  signup?: { csrfToken: string; offer: OfferCopy };
  /** Set when a visitor arrives from a share link and hasn't chosen yet. */
  referralPrompt?: { code: string; back: string; csrfToken: string };
  jsonLd?: Record<string, unknown>[];
};

const NAV = [
  { href: "/method", label: "The Method" },
  { href: "/programmes", label: "Programmes" },
  { href: "/guides", label: "Guides" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

const LEGAL = [
  { href: "/contact", label: "Contact" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/refunds", label: "Refunds" },
  { href: "/legal/health-disclaimer", label: "Health disclaimer" },
  { href: "/legal/affiliate-terms", label: "Affiliate terms" },
];

const isCurrent = (href: string, path: string) => path === href || path.startsWith(href + "/");

export function Layout(props: { meta: PageMeta; children: Child }) {
  const { meta } = props;
  const canonical = new URL(meta.path, meta.siteUrl).toString();
  const fullTitle = meta.path === "/" ? meta.title : `${meta.title} | ${meta.siteName}`;
  const nav = [...NAV, meta.loggedIn ? { href: "/account", label: "My account" } : { href: "/login", label: "Log in" }];
  const navLinks = nav.map((n) => (
    <a href={n.href} aria-current={isCurrent(n.href, meta.path) ? "page" : undefined}>
      {n.label}
    </a>
  ));
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="en-GB">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={canonical} />
        {meta.noindex && <meta name="robots" content="noindex, nofollow" />}
        <meta property="og:type" content={meta.ogType ?? "website"} />
        <meta property="og:image" content={new URL("/og.png", meta.siteUrl).toString()} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="en_GB" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:site_name" content={meta.siteName} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content={canonical} />
        <meta name="theme-color" content="#f4efe6" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#151b18" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href={assetUrl("/favicon.svg")} type="image/svg+xml" />
        <link rel="preload" href="/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin="" />
        <link rel="stylesheet" href={assetUrl("/styles.css")} />
        {meta.signup && <script src={assetUrl("/app.js")} defer />}
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
        {meta.referralPrompt && (
          <form method="post" action="/referral" class="referral-banner" aria-label="Referral">
            <input type="hidden" name="_csrf" value={meta.referralPrompt.csrfToken} />
            <input type="hidden" name="code" value={meta.referralPrompt.code} />
            <input type="hidden" name="back" value={meta.referralPrompt.back} />
            <p>
              A member recommended us to you. May we remember that for 30 days, so they're thanked if you buy? It's a small cookie, used for nothing else.
            </p>
            <div class="referral-actions">
              <button class="btn btn-primary btn-small" type="submit" name="choice" value="yes">
                Yes, that's fine
              </button>
              <button class="btn btn-ghost btn-small" type="submit" name="choice" value="no">
                No thanks
              </button>
            </div>
          </form>
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
        {meta.signup && <SignupDialog csrfToken={meta.signup.csrfToken} offer={meta.signup.offer} />}
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
    </>
  );
}

/** Hidden CSRF field — include inside every POST form. */
export const CsrfField = (props: { token: string }) => <input type="hidden" name={CSRF_FIELD} value={props.token} />;
