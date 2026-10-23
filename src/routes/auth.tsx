import { Hono } from "hono";
import { linkEmail } from "../emails/templates";
import type { AppEnv } from "../env";
import { endSession, safeNext, startSession } from "../middleware/auth";
import { clientIp, rateLimit } from "../middleware/rate-limit";
import { checkLogin, completeSetup, looksLikeEmail, normaliseEmail, passwordProblem, recoveryKind, resetPassword } from "../services/accounts";
import { sendEmail } from "../services/email";
import { createEmailToken, peekEmailToken } from "../services/email-tokens";
import { hitRateLimit } from "../services/rate-limit";
import { ForgotPage, LoginPage, ResetPage, SetupPage } from "../views/auth";
import { pageMeta } from "./meta";

export const authRoutes = new Hono<AppEnv>();

const meta = (c: Parameters<typeof pageMeta>[0], title: string, path: string) => pageMeta(c, { title, description: title, path, noindex: true });

// --- Account setup (from the link emailed after buying) ---

authRoutes.get("/account/setup", async (c) => {
  const token = c.req.query("token") ?? "";
  const found = token ? await peekEmailToken(c.env.DB, "setup", token) : null;
  return c.html(<SetupPage meta={meta(c, "Create your account", "/account/setup")} csrfToken={c.get("csrfToken")} token={token} email={found?.email ?? null} />);
});

authRoutes.post("/account/setup", rateLimit("setup", 10, 900), async (c) => {
  const form = await c.req.parseBody();
  const token = String(form.token ?? "");
  const found = await peekEmailToken(c.env.DB, "setup", token);
  const render = (error: string | null, status: 200 | 422 = 422) =>
    c.html(<SetupPage meta={meta(c, "Create your account", "/account/setup")} csrfToken={c.get("csrfToken")} token={token} email={found?.email ?? null} error={error} />, status);
  if (!found) return render(null, 200);

  const password = String(form.password ?? "");
  const problem = passwordProblem(password, String(form.confirm ?? ""), found.email);
  if (problem) return render(problem);

  const user = await completeSetup(c.env.DB, token, { name: String(form.name ?? ""), password });
  if (!user) return render(null, 200);
  await startSession(c, user);
  return c.redirect("/account?welcome=1", 303);
});

// --- Login / logout ---

authRoutes.get("/login", (c) => {
  if (c.get("user")) return c.redirect(safeNext(c.req.query("next")), 303);
  const notice = c.req.query("reset") ? "Password changed. Please log in." : null;
  return c.html(<LoginPage meta={meta(c, "Log in", "/login")} csrfToken={c.get("csrfToken")} next={safeNext(c.req.query("next"))} notice={notice} />);
});

authRoutes.post("/login", rateLimit("login-ip", 20, 900), async (c) => {
  const form = await c.req.parseBody();
  const email = normaliseEmail(String(form.email ?? ""));
  const next = safeNext(String(form.next ?? ""));
  const fail = (error: string, status: 401 | 429) =>
    c.html(<LoginPage meta={meta(c, "Log in", "/login")} csrfToken={c.get("csrfToken")} next={next} email={email} error={error} />, status);

  // Also limit per account, so one email can't be guessed at from many addresses.
  const perEmail = await hitRateLimit(c.env.DB, `login-email:${email}`, 10, 900);
  if (!perEmail.allowed) return fail("Too many attempts. Please wait 15 minutes, or reset your password.", 429);

  const user = await checkLogin(c.env.DB, email, String(form.password ?? ""));
  if (!user) return fail("That email and password don't match. Check them, or reset your password.", 401);
  if (user.role === "admin") {
    // Admins must also pass two-step verification (handled by the admin login).
    return c.redirect("/admin/login", 303);
  }
  await startSession(c, user);
  return c.redirect(next, 303);
});

authRoutes.post("/logout", async (c) => {
  await endSession(c);
  return c.redirect("/", 303);
});

// --- Forgotten password / lost setup link ---

authRoutes.get("/forgot", (c) => c.html(<ForgotPage meta={meta(c, "Get a login link", "/forgot")} csrfToken={c.get("csrfToken")} />));

authRoutes.post("/forgot", rateLimit("forgot", 5, 900), async (c) => {
  const email = normaliseEmail(String((await c.req.parseBody()).email ?? ""));
  if (!looksLikeEmail(email)) {
    return c.html(<ForgotPage meta={meta(c, "Get a login link", "/forgot")} csrfToken={c.get("csrfToken")} error="Please enter a valid email address." />, 422);
  }
  // Same answer whether or not the email exists, so nobody can test who's a customer.
  const perEmail = await hitRateLimit(c.env.DB, `forgot-email:${email}`, 3, 3600);
  const kind = perEmail.allowed ? await recoveryKind(c.env.DB, email) : null;
  if (kind) {
    const token = await createEmailToken(c.env.DB, kind, email);
    const url = `${c.env.SITE_URL}/${kind === "reset" ? "reset" : "account/setup"}?token=${token}`;
    await sendEmail(c.env, linkEmail({ siteName: c.env.SITE_NAME, to: email, purpose: kind, url }));
  }
  console.log("Recovery requested", { ip: clientIp(c.req.raw), sent: !!kind });
  return c.html(<ForgotPage meta={meta(c, "Get a login link", "/forgot")} csrfToken={c.get("csrfToken")} sent />);
});

authRoutes.get("/reset", async (c) => {
  const token = c.req.query("token") ?? "";
  const valid = !!token && !!(await peekEmailToken(c.env.DB, "reset", token));
  return c.html(<ResetPage meta={meta(c, "Choose a new password", "/reset")} csrfToken={c.get("csrfToken")} token={token} valid={valid} />);
});

authRoutes.post("/reset", rateLimit("reset", 10, 900), async (c) => {
  const form = await c.req.parseBody();
  const token = String(form.token ?? "");
  const found = await peekEmailToken(c.env.DB, "reset", token);
  const render = (error: string | null, valid: boolean) =>
    c.html(<ResetPage meta={meta(c, "Choose a new password", "/reset")} csrfToken={c.get("csrfToken")} token={token} valid={valid} error={error} />, valid ? 422 : 200);
  if (!found) return render(null, false);
  const password = String(form.password ?? "");
  const problem = passwordProblem(password, String(form.confirm ?? ""), found.email);
  if (problem) return render(problem, true);
  const user = await resetPassword(c.env.DB, token, password);
  if (!user) return render(null, false);
  return c.redirect("/login?reset=1", 303);
});
