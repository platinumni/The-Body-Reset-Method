import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { CODE_PATTERN, REF_COOKIE } from "../services/affiliates";
import { BASKET_COOKIE, parseBasket } from "../services/basket";
import type { AppEnv } from "../env";
import { isProduction } from "../env";
import type { PageMeta } from "../views/layout";

/** Build page metadata with site-wide defaults filled in from the environment. */
export function pageMeta(c: Context<AppEnv>, m: Pick<PageMeta, "title" | "description" | "path"> & Partial<PageMeta>): PageMeta {
  return {
    siteName: c.env.SITE_NAME,
    siteUrl: c.env.SITE_URL,
    noindex: !isProduction(c.env),
    isTestSite: !isProduction(c.env),
    basketCount: parseBasket(getCookie(c, BASKET_COOKIE)).length,
    loggedIn: !!c.get("user"),
    referralPrompt: referralPrompt(c),
    signup: signupFor(c),
    ...m,
  };
}

function referralPrompt(c: Context<AppEnv>): PageMeta["referralPrompt"] {
  const code = c.req.query("ref")?.toLowerCase();
  if (!code || !CODE_PATTERN.test(code) || getCookie(c, REF_COOKIE)) return undefined;
  const url = new URL(c.req.url);
  url.searchParams.delete("ref");
  return { code, back: url.pathname + url.search, csrfToken: c.get("csrfToken") };
}

// Pages where the sign-up pop-up may appear (never on checkout, account, legal or admin pages).
const SIGNUP_PAGES = [/^\/$/, /^\/method$/, /^\/programmes(\/|$)/, /^\/guides(\/|$)/, /^\/about$/, /^\/faq$/];

function signupFor(c: Context<AppEnv>): PageMeta["signup"] {
  if (c.get("user") || !SIGNUP_PAGES.some((re) => re.test(c.req.path))) return undefined;
  return { csrfToken: c.get("csrfToken"), offer: c.get("siteContent")?.offer ?? null };
}
