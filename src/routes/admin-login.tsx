import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { renderSVG } from "uqr";
import type { AppEnv } from "../env";
import { isDevelopment, isProduction } from "../env";
import { otpauthUri, newTotpSecret } from "../lib/totp";
import { endSession, startSession } from "../middleware/auth";
import { clientIp, rateLimit } from "../middleware/rate-limit";
import { checkLogin, normaliseEmail } from "../services/accounts";
import { recordAudit } from "../services/audit";
import { checkBackupCode, checkTotpCode, createChallenge, enableMfa, finishChallenge, hasMfa, peekChallenge, useChallengeAttempt } from "../services/mfa";
import { hitRateLimit } from "../services/rate-limit";
import type { SessionUser } from "../services/sessions";
import type { AdminMeta } from "../views/admin/layout";
import { AdminEnrolPage, AdminLoginPage, AdminVerifyPage, BackupCodesPage } from "../views/admin/login";

// Admin login: password → authenticator code (or backup code) → 12-hour admin session.
// First time: password → scan QR code and confirm a code → backup codes → session.

export const adminLoginRoutes = new Hono<AppEnv>();

const challengeCookie = (env: Env) => (isDevelopment(env) ? "brm_mfa" : "__Host-brm_mfa");

export const adminMeta = (c: Context<AppEnv>, title: string, extra: Partial<AdminMeta> = {}): AdminMeta => ({
  title,
  path: c.req.path,
  csrfToken: c.get("csrfToken"),
  email: c.get("user")?.email,
  isTestSite: !isProduction(c.env),
  ...extra,
});

const notConfigured = (c: Context<AppEnv>) => c.text("Admin isn't set up on this site yet (ADMIN_ENC_KEY missing).", 503);

async function userById(db: D1Database, id: number): Promise<SessionUser | null> {
  return db.prepare("SELECT id, email, name, role FROM users WHERE id = ?1 AND role = 'admin' AND deleted_at IS NULL").bind(id).first<SessionUser>();
}

adminLoginRoutes.get("/admin/login", (c) => {
  const notice = c.req.query("setup") ? "Password saved. Now log in to set up two-step login." : null;
  return c.html(<AdminLoginPage meta={adminMeta(c, "Admin log in")} notice={notice} />);
});

adminLoginRoutes.post("/admin/login", rateLimit("admin-login-ip", 10, 900), async (c) => {
  if (!c.env.ADMIN_ENC_KEY) return notConfigured(c);
  const form = await c.req.parseBody();
  const email = normaliseEmail(String(form.email ?? ""));
  const fail = () => c.html(<AdminLoginPage meta={adminMeta(c, "Admin log in", { error: "Those details aren't right." })} />, 401);
  if (!(await hitRateLimit(c.env.DB, `admin-login-email:${email}`, 5, 900)).allowed) return c.text("Too many attempts. Wait 15 minutes.", 429);

  const user = await checkLogin(c.env.DB, email, String(form.password ?? ""));
  if (!user || user.role !== "admin") return fail();
  const token = await createChallenge(c.env.DB, user.id);
  setCookie(c, challengeCookie(c.env), token, { path: "/", httpOnly: true, secure: !isDevelopment(c.env), sameSite: "Strict", maxAge: 300 });
  return c.redirect((await hasMfa(c.env.DB, user.id)) ? "/admin/login/verify" : "/admin/login/enrol", 303);
});

adminLoginRoutes.get("/admin/login/verify", async (c) => {
  if (!(await peekChallenge(c.env.DB, getCookie(c, challengeCookie(c.env))))) return c.redirect("/admin/login", 303);
  return c.html(<AdminVerifyPage meta={adminMeta(c, "Two-step check")} />);
});

adminLoginRoutes.post("/admin/login/verify", async (c) => {
  if (!c.env.ADMIN_ENC_KEY) return notConfigured(c);
  const challenge = await useChallengeAttempt(c.env.DB, getCookie(c, challengeCookie(c.env)));
  if (!challenge) return c.redirect("/admin/login", 303);
  const form = await c.req.parseBody();
  const ok = form.backup
    ? await checkBackupCode(c.env.DB, challenge.userId, String(form.backup))
    : await checkTotpCode(c.env.DB, c.env.ADMIN_ENC_KEY, challenge.userId, String(form.code ?? ""));
  if (!ok) return c.html(<AdminVerifyPage meta={adminMeta(c, "Two-step check", { error: "That code didn't work. Codes change every 30 seconds." })} />, 401);

  const user = await userById(c.env.DB, challenge.userId);
  if (!user) return c.redirect("/admin/login", 303);
  await finishChallenge(c.env.DB, challenge.id);
  deleteCookie(c, challengeCookie(c.env), { path: "/", secure: !isDevelopment(c.env) });
  await startSession(c, user, { mfaVerified: true });
  await recordAudit(c.env.DB, { actorUserId: user.id, action: form.backup ? "admin.login_backup_code" : "admin.login", ip: clientIp(c.req.raw) });
  return c.redirect("/admin", 303);
});

adminLoginRoutes.get("/admin/login/enrol", async (c) => {
  const challenge = await peekChallenge(c.env.DB, getCookie(c, challengeCookie(c.env)));
  if (!challenge || (await hasMfa(c.env.DB, challenge.userId))) return c.redirect("/admin/login", 303);
  const user = await userById(c.env.DB, challenge.userId);
  if (!user) return c.redirect("/admin/login", 303);
  const secret = newTotpSecret();
  const uri = otpauthUri(secret, user.email, c.env.SITE_NAME);
  const qr = `data:image/svg+xml;base64,${btoa(renderSVG(uri))}`;
  return c.html(<AdminEnrolPage meta={adminMeta(c, "Set up two-step login")} secret={secret} qrDataUri={qr} otpauth={uri} />);
});

adminLoginRoutes.post("/admin/login/enrol", async (c) => {
  if (!c.env.ADMIN_ENC_KEY) return notConfigured(c);
  const challenge = await useChallengeAttempt(c.env.DB, getCookie(c, challengeCookie(c.env)));
  if (!challenge || (await hasMfa(c.env.DB, challenge.userId))) return c.redirect("/admin/login", 303);
  const form = await c.req.parseBody();
  const secret = String(form.secret ?? "");
  if (!/^[A-Z2-7]{32}$/.test(secret)) return c.redirect("/admin/login", 303);
  const codes = await enableMfa(c.env.DB, c.env.ADMIN_ENC_KEY, challenge.userId, secret, String(form.code ?? ""));
  if (!codes) {
    const user = await userById(c.env.DB, challenge.userId);
    const uri = otpauthUri(secret, user?.email ?? "", c.env.SITE_NAME);
    const qr = `data:image/svg+xml;base64,${btoa(renderSVG(uri))}`;
    return c.html(<AdminEnrolPage meta={adminMeta(c, "Set up two-step login", { error: "That code didn't match. Check the app and try the newest code." })} secret={secret} qrDataUri={qr} otpauth={uri} />, 401);
  }
  const user = await userById(c.env.DB, challenge.userId);
  if (!user) return c.redirect("/admin/login", 303);
  await finishChallenge(c.env.DB, challenge.id);
  deleteCookie(c, challengeCookie(c.env), { path: "/", secure: !isDevelopment(c.env) });
  await startSession(c, user, { mfaVerified: true });
  await recordAudit(c.env.DB, { actorUserId: user.id, action: "admin.mfa_enabled", ip: clientIp(c.req.raw) });
  return c.html(<BackupCodesPage meta={adminMeta(c, "Backup codes")} codes={codes} />);
});

adminLoginRoutes.post("/admin/logout", async (c) => {
  await endSession(c);
  return c.redirect("/admin/login", 303);
});
