import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { isDevelopment } from "../env";
import { randomToken, timingSafeEqual } from "../lib/crypto";

// CSRF protection on every form (double-submit cookie + same-origin check).
// Each visitor gets a random token in a cookie; every POST form must send the same
// token in a hidden "_csrf" field (use <CsrfField /> in views). A malicious site
// can't read our cookie, so it can't forge a matching field.

export const CSRF_FIELD = "_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** "__Host-" cookies must be Secure, which local http dev can't do. */
export const csrfCookieName = (env: Env) => (isDevelopment(env) ? "brm_csrf" : "__Host-brm_csrf");

// Server-to-server callbacks (e.g. Stripe) are authenticated by their own signature instead.
// "/unsubscribe" is authenticated by a signed token, and mail apps POST to it directly (RFC 8058 one-click).
const EXEMPT_PREFIXES = ["/webhooks/", "/unsubscribe"];

export const csrf = createMiddleware<AppEnv>(async (c, next) => {
  if (EXEMPT_PREFIXES.some((p) => c.req.path.startsWith(p))) return next();
  const name = csrfCookieName(c.env);
  let token = getCookie(c, name);

  if (!SAFE_METHODS.has(c.req.method)) {
    // Reject cross-site requests outright when the browser tells us the origin.
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.text("Forbidden: cross-site request", 403);

    const type = c.req.header("Content-Type") ?? "";
    let sent: string | undefined;
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const value = (await c.req.parseBody())[CSRF_FIELD];
      sent = typeof value === "string" ? value : undefined;
    } else {
      sent = c.req.header("X-CSRF-Token");
    }
    if (!token || !sent || !timingSafeEqual(token, sent)) {
      return c.text("Your session expired. Please go back, refresh the page and try again.", 403);
    }
  }

  if (!token) {
    token = randomToken(24);
    setCookie(c, name, token, { path: "/", httpOnly: true, secure: !isDevelopment(c.env), sameSite: "Lax" });
  }
  c.set("csrfToken", token);
  await next();
});
