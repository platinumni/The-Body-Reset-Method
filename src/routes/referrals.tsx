import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { isDevelopment } from "../env";
import { safeNext } from "../middleware/auth";
import { activeAffiliateByCode, CODE_PATTERN, recordAffiliateClick, REF_COOKIE, REF_COOKIE_DAYS } from "../services/affiliates";

// Share links: /r/CODE (optionally /r/CODE?to=/programmes/lower-body-regeneration).
// The click is counted anonymously. The visitor is then ASKED before we store a
// referral cookie (it isn't strictly necessary, so UK PECR requires consent).

export const referralRoutes = new Hono<AppEnv>();

referralRoutes.get("/r/:code", async (c) => {
  const code = c.req.param("code").toLowerCase();
  const target = safeNext(c.req.query("to"), "/");
  const affiliate = await activeAffiliateByCode(c.env.DB, code);
  if (!affiliate) return c.redirect(target, 302);
  await recordAffiliateClick(c.env.DB, affiliate.id);
  const sep = target.includes("?") ? "&" : "?";
  return c.redirect(getCookie(c, REF_COOKIE) ? target : `${target}${sep}ref=${code}`, 302);
});

referralRoutes.post("/referral", async (c) => {
  const form = await c.req.parseBody();
  const code = String(form.code ?? "").toLowerCase();
  const back = safeNext(String(form.back ?? "/"), "/");
  if (form.choice === "yes" && CODE_PATTERN.test(code) && (await activeAffiliateByCode(c.env.DB, code))) {
    setCookie(c, REF_COOKIE, code, { path: "/", httpOnly: true, secure: !isDevelopment(c.env), sameSite: "Lax", maxAge: REF_COOKIE_DAYS * 86_400 });
  }
  return c.redirect(back, 303);
});
