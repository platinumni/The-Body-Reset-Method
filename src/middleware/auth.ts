import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { isDevelopment } from "../env";
import { clientIp } from "./rate-limit";
import { ADMIN_SESSION_HOURS, createSession, getSessionUser, revokeSession, SESSION_DAYS, type SessionUser } from "../services/sessions";

// Login cookie handling. The cookie holds a random token; the database holds its hash.

export const sessionCookieName = (env: Env) => (isDevelopment(env) ? "brm_session" : "__Host-brm_session");

export async function startSession(c: Context<AppEnv>, user: SessionUser, opts: { mfaVerified?: boolean } = {}): Promise<void> {
  const hours = user.role === "admin" ? ADMIN_SESSION_HOURS : SESSION_DAYS * 24;
  const { token } = await createSession(c.env.DB, user.id, { ip: clientIp(c.req.raw), userAgent: c.req.header("User-Agent"), hours, mfaVerified: opts.mfaVerified });
  setCookie(c, sessionCookieName(c.env), token, {
    path: "/",
    httpOnly: true,
    secure: !isDevelopment(c.env),
    sameSite: "Lax",
    maxAge: hours * 3600,
  });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, sessionCookieName(c.env));
  if (token) await revokeSession(c.env.DB, token);
  deleteCookie(c, sessionCookieName(c.env), { path: "/", secure: !isDevelopment(c.env) });
}

/** Look up the logged-in member (if any) and make it available as c.get("user"). */
export const loadUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, sessionCookieName(c.env));
  c.set("user", token ? await getSessionUser(c.env.DB, token) : null);
  await next();
});

/** Only allow local paths for "send me back where I was" redirects. */
export function safeNext(next: string | undefined | null, fallback = "/account"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/** Admin pages: anyone else gets a plain "not found", so the admin area isn't advertised. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin" || user.mfa !== 1) {
    if (c.req.method === "GET" && !c.get("user")) return c.redirect("/admin/login", 303);
    return c.notFound();
  }
  c.header("Cache-Control", "no-store");
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) return c.redirect(`/login?next=${encodeURIComponent(c.req.path)}`, 303);
  await next();
});
