import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { isProduction } from "../env";

// Strict Content Security Policy: no inline scripts, no third-party scripts.
// YouTube is allowed only as a privacy-enhanced embed (youtube-nocookie.com) for programme videos.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https://i.ytimg.com",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("Content-Security-Policy", CSP);
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  // The test site must never appear in Google.
  if (!isProduction(c.env)) h.set("X-Robots-Tag", "noindex, nofollow");
});
