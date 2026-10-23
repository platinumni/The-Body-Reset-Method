import type { Context } from "hono";
import { getCookie } from "hono/cookie";
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
    ...m,
  };
}
