import { Hono } from "hono";
import { accessCodeEmail } from "../emails/automation";
import type { AppEnv } from "../env";
import { inBackground } from "../lib/background";
import { rateLimit } from "../middleware/rate-limit";
import { looksLikeEmail, normaliseEmail } from "../services/accounts";
import { CODE_CONSENTS, confirmClaim, requestClaim } from "../services/access-codes";
import { sendEmail } from "../services/email";
import { hitRateLimit } from "../services/rate-limit";
import { cleanGe, queueEngineEvent, sendEngineEvents } from "../services/growth-engine";
import { RedeemPage } from "../views/redeem";
import { pageMeta } from "./meta";

// Access codes from partners (clubs, gyms, employers, charities) and for beta testers.

export const codeRoutes = new Hono<AppEnv>();

const redeemMeta = (c: Parameters<typeof pageMeta>[0]) => pageMeta(c, { title: "Use your access code", description: "Unlock access with a code from your club, gym, workplace or charity.", path: "/redeem", noindex: true });

codeRoutes.get("/redeem", (c) => c.html(<RedeemPage meta={redeemMeta(c)} csrfToken={c.get("csrfToken")} code={(c.req.query("code") ?? "").slice(0, 24)} />));

codeRoutes.post("/redeem", rateLimit("redeem", 10, 3600), async (c) => {
  const form = await c.req.parseBody();
  const code = String(form.code ?? "").trim().toUpperCase();
  const email = normaliseEmail(String(form.email ?? ""));
  const consents = Object.fromEntries(CODE_CONSENTS.map((k) => [k, form[k] === "yes"]));
  const errors = [
    !looksLikeEmail(email) ? "Please enter a valid email address." : null,
    CODE_CONSENTS.some((k) => !consents[k]) ? "Please tick both boxes to continue." : null,
  ].filter((e): e is string => !!e);
  if (errors.length) return c.html(<RedeemPage meta={redeemMeta(c)} csrfToken={c.get("csrfToken")} code={code} email={email} errors={errors} />, 422);
  if (await hitLimit(c.env.DB, email)) {
    const claim = await requestClaim(c.env.DB, code, email, consents, cleanGe(form.ge));
    if (claim) {
      await sendEmail(c.env, accessCodeEmail({ siteName: c.env.SITE_NAME, to: email, url: `${c.env.SITE_URL}/redeem/confirm?token=${claim.token}`, label: claim.code.label, beta: claim.code.kind === "beta" }));
    }
  }
  // Same answer whether or not the code is valid, so codes can't be guessed from this page.
  return c.html(<RedeemPage meta={redeemMeta(c)} csrfToken={c.get("csrfToken")} sentTo={email} />);
});

const hitLimit = async (db: D1Database, email: string) => (await hitRateLimit(db, `redeem-email:${email}`, 3, 3600)).allowed;

codeRoutes.get("/redeem/confirm", async (c) => {
  const result = await confirmClaim(c.env.DB, c.req.query("token") ?? "");
  if (result.outcome === "invalid" || result.outcome === "used-up") {
    const msg = result.outcome === "invalid" ? "That link has expired or isn't valid. Please enter your code again." : "Sorry, that code has been used up or is no longer active. Please check with whoever gave it to you.";
    return c.html(<RedeemPage meta={redeemMeta(c)} csrfToken={c.get("csrfToken")} errors={[msg]} />, 400);
  }
  if (result.outcome === "claimed") {
    await queueEngineEvent(c.env.DB, { type: "signup", ref: result.geRef, code: result.code.code, value_pence: 0, external_id: `signup-code-${result.claimId}` });
    await inBackground(c, sendEngineEvents(c.env));
  }
  const setupToken = "setupToken" in result ? result.setupToken : null;
  return c.redirect(setupToken ? `/account/setup?token=${setupToken}` : "/login?next=/account", 303);
});
