import { Hono } from "hono";
import { DAILY_CRON, WEEKLY_CRON } from "./cron";
import type { AppEnv } from "./env";
import { loadUser } from "./middleware/auth";
import { csrf } from "./middleware/csrf";
import { carryGe } from "./middleware/ge";
import { securityHeaders } from "./middleware/security";
import { accountRoutes } from "./routes/account";
import { refreshOfficialPrices } from "./services/official-prices";
import { adminRoutes } from "./routes/admin";
import { adminLoginRoutes } from "./routes/admin-login";
import { assetRoutes } from "./routes/assets";
import { authRoutes } from "./routes/auth";
import { pageMeta } from "./routes/meta";
import { publicRoutes } from "./routes/public";
import { marketingRoutes } from "./routes/marketing";
import { referralRoutes } from "./routes/referrals";
import { unsubscribeRoutes } from "./routes/unsubscribe";
import { shopRoutes } from "./routes/shop";
import { kitchenRoutes } from "./routes/kitchen";
import { codeRoutes } from "./routes/codes";
import { backupDatabase } from "./services/backup";
import { releaseHeldCommissions } from "./services/affiliates";
import { adminEmails, checkUsage, sendFreeWeekFollowUps, notifyReleasedCommission, sendCheckIns, sendReviewRequests, sendMorningReport, sendSetupReminders } from "./services/automation";
import { pruneRateLimits } from "./services/rate-limit";
import { runSequences } from "./services/sequences";
import { sendEngineEvents } from "./services/growth-engine";
import { dailyPhotoPick } from "./services/recipe-photos";
import { loadSiteContent } from "./services/site-content";
import { isBot, recordStat } from "./services/stats";
import { NotFoundPage, ServerErrorPage } from "./views/errors";

export const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("*", csrf);
app.use("*", loadUser); // only queries the database when a login cookie is present
app.use("*", carryGe);

// Owner-edited wording for public pages, loaded once per request.
const NO_CONTENT = ["/recipe-photos", "/marketing-feed.json", "/admin", "/webhooks", "/fonts", "/styles.css", "/favicon", "/app.js", "/og.png", "/health", "/media", "/r/"];
app.use("*", async (c, next) => {
  if (c.req.method === "GET" && !NO_CONTENT.some((p) => c.req.path.startsWith(p))) c.set("siteContent", await loadSiteContent(c.env.DB));
  await next();
});

// Anonymous page-view counts for public pages (no cookies, no IPs, bots ignored).
const UNCOUNTED = ["/admin", "/account", "/media", "/webhooks", "/checkout", "/reset", "/health", "/fonts", "/styles.css", "/favicon"];
app.use("*", async (c, next) => {
  await next();
  if (c.req.method !== "GET" || c.res.status !== 200 || !c.res.headers.get("Content-Type")?.includes("text/html")) return;
  if (UNCOUNTED.some((p) => c.req.path.startsWith(p)) || isBot(c.req.header("User-Agent")) || c.get("user")?.role === "admin") return;
  const work = recordStat(c.env.DB, "view", c.req.path).catch((err) => console.error("stat failed", String(err)));
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    await work; // no execution context (tests)
  }
});

app.route("/", assetRoutes);
app.route("/", publicRoutes);
app.route("/", shopRoutes);
app.route("/", referralRoutes);
app.route("/", marketingRoutes);
app.route("/", kitchenRoutes);
app.route("/", codeRoutes);
app.route("/", unsubscribeRoutes);
app.route("/", authRoutes);
app.route("/", accountRoutes);
app.route("/", adminLoginRoutes);
app.route("/", adminRoutes);

app.notFound((c) => c.html(<NotFoundPage meta={pageMeta(c, { title: "Page not found", description: "Page not found.", path: c.req.path, noindex: true })} />, 404));

app.onError((err, c) => {
  console.error("Unhandled error", { path: c.req.path, err: String(err), stack: err instanceof Error ? err.stack : undefined });
  return c.html(<ServerErrorPage meta={pageMeta(c, { title: "Something went wrong", description: "Error.", path: c.req.path, noindex: true })} />, 500);
});


/**
 * Scheduled jobs.
 *  Weekly (Sunday 03:00 UTC): database backup + housekeeping.
 *  Daily (06:00 UTC, 6–7am UK): release held commission, reminders and check-ins,
 *  usage watch, the owner's morning report, then (about monthly) official food prices.
 *  Each step runs even if another fails.
 */
export async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  if (controller.cron === WEEKLY_CRON) {
    await backupDatabase(env.DB, env.BACKUPS, "weekly");
    await pruneRateLimits(env.DB);
  }
  if (controller.cron === DAILY_CRON) {
    const steps: [string, () => Promise<unknown>][] = [
      ["commission", async () => notifyReleasedCommission(env, await releaseHeldCommissions(env.DB))],
      ["setup-reminders", () => sendSetupReminders(env)],
      ["check-ins", () => sendCheckIns(env)],
      ["review-requests", () => sendReviewRequests(env)],
      ["email-series", () => runSequences(env)],
      ["kitchen-follow-ups", () => sendFreeWeekFollowUps(env)],
      ["recipe-photos", () => dailyPhotoPick(env)],
      ["growth-engine", () => sendEngineEvents(env)],
      ["usage", async () => checkUsage(env, await adminEmails(env.DB))],
      ["morning-report", () => sendMorningReport(env)],
      // Official food prices for the meal planner: refreshed about monthly (skips if recent).
      ["meal-prices", () => refreshOfficialPrices(env)],
    ];
    for (const [name, run] of steps) {
      try {
        console.log("Daily job", { name, result: await run() });
      } catch (err) {
        console.error("Daily job failed", { name, err: String(err) });
      }
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled: (controller, env, ctx) => ctx.waitUntil(scheduled(controller, env)),
} satisfies ExportedHandler<Env>;
