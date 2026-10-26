import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { cleanGe } from "../services/growth-engine";

// Carries the growth engine's "ge" campaign reference (from ?ge=CODE) through a visit
// without a cookie: it's added to the site's own links and forms on each page, and to
// redirects after a form is posted. If the visitor leaves and comes back later, it's gone.

const SKIP = ["/admin", "/account", "/webhooks", "/media", "/fonts", "/styles.css", "/app.js", "/reader.js", "/favicon", "/og.png", "/health", "/unsubscribe"];

const isFormPost = (ct: string | undefined) => !!ct && (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data"));

/** Adds ge=CODE to a same-site path, unless it's already there or is a page we never tag. */
export function withGe(href: string, ge: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || SKIP.some((p) => href.startsWith(p))) return href;
  const [pathAndQuery, hash] = href.split("#", 2) as [string, string | undefined];
  if (/[?&]ge=/.test(pathAndQuery)) return href;
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  return `${pathAndQuery}${sep}ge=${encodeURIComponent(ge)}${hash !== undefined ? `#${hash}` : ""}`;
}

export const carryGe: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SKIP.some((p) => c.req.path.startsWith(p))) return next();
  let ge = cleanGe(c.req.query("ge"));
  if (!ge && c.req.method === "POST" && isFormPost(c.req.header("Content-Type"))) ge = cleanGe((await c.req.parseBody()).ge);
  await next();
  if (!ge) return;

  const location = c.res.headers.get("Location");
  if (location && c.res.status >= 300 && c.res.status < 400) {
    c.res.headers.set("Location", withGe(location, ge));
    return;
  }
  if (!c.res.headers.get("Content-Type")?.includes("text/html")) return;
  const value = ge;
  c.res.headers.delete("Content-Length");
  c.res = new HTMLRewriter()
    .on("a[href]", {
      element(el) {
        const href = el.getAttribute("href");
        if (href) el.setAttribute("href", withGe(href, value));
      },
    })
    .on("form", {
      element(el) {
        const action = el.getAttribute("action") ?? "";
        if ((el.getAttribute("method") ?? "get").toLowerCase() !== "post" || (action && withGe(action, value) === action)) return;
        el.append(`<input type="hidden" name="ge" value="${value}">`, { html: true });
      },
    })
    .transform(c.res);
};
