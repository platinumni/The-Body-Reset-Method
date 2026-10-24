import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { endSession, requireUser, startSession } from "../middleware/auth";
import { clientIp, rateLimit } from "../middleware/rate-limit";
import { affiliateSettings, affiliateSummary, getAffiliateByUser, joinAffiliateProgramme, setPayoutEmail } from "../services/affiliates";
import { changePassword, deleteAccount, exportUserData, looksLikeEmail, marketingOptedIn, passwordProblem, setMarketing, verifyUserPassword } from "../services/accounts";
import { canViewMedia, listLessons, listOwnedProgrammes, MODES, ownedProgrammeBySlug, setLessonDone, type Mode } from "../services/library";
import { AccountPage, ReaderPage } from "../views/account";
import { pageMeta } from "./meta";

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.use("/account", requireUser);
accountRoutes.use("/account/*", async (c, next) => (c.req.path === "/account/setup" ? next() : requireUser(c, next)));
accountRoutes.use("/media/*", requireUser);

const NOTICES: Record<string, string> = {
  welcome: "Your account is ready. Start with the Full Programme.",
  subscribed: "You're subscribed to news and new programmes.",
  unsubscribed: "You've been unsubscribed. You'll still get emails about your orders.",
  password: "Password changed. You've been logged out on other devices.",
  affiliate: "Your share link is ready.",
  payout: "Payout details saved.",
};

async function renderAccount(c: Context<AppEnv>, opts: { error?: string; status?: 200 | 401 | 422 } = {}) {
  const user = c.get("user")!;
  const noticeKey = Object.keys(NOTICES).find((k) => c.req.query(k) !== undefined);
  const programmes = await listOwnedProgrammes(c.env.DB, user.id);
  const settings = await affiliateSettings(c.env.DB);
  const affiliate = await getAffiliateByUser(c.env.DB, user.id);
  return c.html(
    <AccountPage
      meta={pageMeta(c, { title: "My account", description: "Your programmes and account.", path: "/account", noindex: true })}
      csrfToken={c.get("csrfToken")}
      user={user}
      programmes={programmes}
      marketing={await marketingOptedIn(c.env.DB, user.email)}
      affiliate={{
        csrfToken: c.get("csrfToken"),
        ratePercent: settings.ratePercent,
        holdDays: settings.holdDays,
        affiliate,
        summary: affiliate ? await affiliateSummary(c.env.DB, affiliate.id) : null,
        link: affiliate ? `${c.env.SITE_URL}/r/${affiliate.code}` : null,
        ownsProgramme: programmes.length > 0,
      }}
      notice={noticeKey ? NOTICES[noticeKey] : null}
      error={opts.error ?? null}
    />,
    opts.status ?? 200,
  );
}

accountRoutes.get("/account", (c) => renderAccount(c));

/** ?mode=guide|listen|points|sheet (older links used ?tab=full|quick). */
function readMode(value: string | undefined): Mode {
  if (value === "quick") return "points";
  return MODES.find((m) => m === value) ?? "guide";
}

accountRoutes.get("/account/programmes/:slug", async (c) => {
  const user = c.get("user")!;
  const programme = await ownedProgrammeBySlug(c.env.DB, user.id, c.req.param("slug"));
  if (!programme) return c.notFound();
  const mode = readMode(c.req.query("mode") ?? c.req.query("tab"));
  return c.html(
    <ReaderPage
      meta={pageMeta(c, { title: programme.title, description: programme.title, path: `/account/programmes/${programme.slug}`, noindex: true })}
      csrfToken={c.get("csrfToken")}
      programme={programme}
      mode={mode}
      lessons={await listLessons(c.env.DB, user.id, programme.id)}
    />,
  );
});

accountRoutes.post("/account/programmes/:slug/progress", async (c) => {
  const user = c.get("user")!;
  const programme = await ownedProgrammeBySlug(c.env.DB, user.id, c.req.param("slug"));
  if (!programme) return c.notFound();
  const form = await c.req.parseBody();
  const lessonId = Number(form.lesson);
  const mode = readMode(String(form.mode ?? form.tab ?? ""));
  if (Number.isInteger(lessonId)) await setLessonDone(c.env.DB, user.id, programme.id, lessonId, form.done === "yes");
  return c.redirect(`/account/programmes/${programme.slug}?mode=${mode}#lesson-${lessonId}`, 303);
});

accountRoutes.post("/account/marketing", async (c) => {
  const user = c.get("user")!;
  const on = (await c.req.parseBody()).marketing === "yes";
  await setMarketing(c.env.DB, user, on, "account-page");
  return c.redirect(`/account?${on ? "subscribed" : "unsubscribed"}`, 303);
});

accountRoutes.post("/account/password", rateLimit("change-password", 10, 900), async (c) => {
  const user = c.get("user")!;
  const form = await c.req.parseBody();
  const next = String(form.password ?? "");
  const problem = passwordProblem(next, String(form.confirm ?? ""), user.email);
  if (problem) return renderAccount(c, { error: problem, status: 422 });
  if (!(await changePassword(c.env.DB, user.id, String(form.current ?? ""), next))) {
    return renderAccount(c, { error: "Your current password wasn't right.", status: 401 });
  }
  // changePassword logs out every session, including this one; start a fresh one here.
  await startSession(c, user);
  return c.redirect("/account?password", 303);
});

accountRoutes.post("/account/affiliate/join", async (c) => {
  const user = c.get("user")!;
  if ((await c.req.parseBody()).terms !== "yes") return c.redirect("/account#share", 303);
  if ((await affiliateSettings(c.env.DB)).ratePercent == null) return c.redirect("/account#share", 303);
  const affiliate = await joinAffiliateProgramme(c.env.DB, user);
  return c.redirect(affiliate ? "/account?affiliate#share" : "/account#share", 303);
});

accountRoutes.post("/account/affiliate/payout", async (c) => {
  const user = c.get("user")!;
  const email = String((await c.req.parseBody()).payout_email ?? "").trim().toLowerCase();
  if (email && !looksLikeEmail(email)) return renderAccount(c, { error: "That payout email doesn't look right.", status: 422 });
  await setPayoutEmail(c.env.DB, user.id, email);
  return c.redirect("/account?payout#share", 303);
});

accountRoutes.get("/account/export", async (c) => {
  const user = c.get("user")!;
  const data = await exportUserData(c.env.DB, user.id);
  c.header("Content-Disposition", `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("Cache-Control", "no-store");
  return c.json(data);
});

accountRoutes.post("/account/delete", rateLimit("delete-account", 5, 900), async (c) => {
  const user = c.get("user")!;
  if (!(await verifyUserPassword(c.env.DB, user.id, String((await c.req.parseBody()).password ?? "")))) {
    return renderAccount(c, { error: "That password wasn't right, so your account has not been deleted.", status: 401 });
  }
  await deleteAccount(c.env.DB, user.id, { userId: user.id, ip: clientIp(c.req.raw) });
  await endSession(c);
  return c.redirect("/?deleted=1", 303);
});

// Programme images: only members who own the programme (or admins) can load them.
accountRoutes.get("/media/:key{.+}", async (c) => {
  const user = c.get("user")!;
  const key = c.req.param("key");
  if (user.role !== "admin" && !(await canViewMedia(c.env.DB, user.id, key))) return c.notFound();
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.notFound();
  c.header("Content-Type", obj.httpMetadata?.contentType ?? "application/octet-stream");
  c.header("Cache-Control", "private, max-age=3600");
  return c.body(obj.body);
});
