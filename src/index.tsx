import { Hono } from "hono";
import type { AppEnv } from "./env";
import { loadUser } from "./middleware/auth";
import { csrf } from "./middleware/csrf";
import { securityHeaders } from "./middleware/security";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { adminLoginRoutes } from "./routes/admin-login";
import { assetRoutes } from "./routes/assets";
import { authRoutes } from "./routes/auth";
import { pageMeta } from "./routes/meta";
import { publicRoutes } from "./routes/public";
import { referralRoutes } from "./routes/referrals";
import { shopRoutes } from "./routes/shop";
import { backupDatabase } from "./services/backup";
import { releaseHeldCommissions } from "./services/affiliates";
import { pruneRateLimits } from "./services/rate-limit";
import { isBot, recordStat } from "./services/stats";
import { NotFoundPage, ServerErrorPage } from "./views/errors";

export const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("*", csrf);
app.use("*", loadUser); // only queries the database when a login cookie is present

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
app.route("/", authRoutes);
app.route("/", accountRoutes);
app.route("/", adminLoginRoutes);
app.route("/", adminRoutes);

app.notFound((c) => c.html(<NotFoundPage meta={pageMeta(c, { title: "Page not found", description: "Page not found.", path: c.req.path, noindex: true })} />, 404));

app.onError((err, c) => {
  console.error("Unhandled error", { path: c.req.path, err: String(err), stack: err instanceof Error ? err.stack : undefined });
  return c.html(<ServerErrorPage meta={pageMeta(c, { title: "Something went wrong", description: "Error.", path: c.req.path, noindex: true })} />, 500);
});

export const WEEKLY_CRON = "0 3 * * SUN";
export const DAILY_CRON = "0 4 * * *";

/** Scheduled jobs. Weekly (Sunday 03:00 UTC): backup + housekeeping. Daily (04:00 UTC): release held commission. */
export async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  if (controller.cron === WEEKLY_CRON) {
    await backupDatabase(env.DB, env.BACKUPS, "weekly");
    await pruneRateLimits(env.DB);
  }
  if (controller.cron === DAILY_CRON) {
    const released = await releaseHeldCommissions(env.DB);
    if (released) console.log("Released held commission", { released });
  }
}

export default {
  fetch: app.fetch,
  scheduled: (controller, env, ctx) => ctx.waitUntil(scheduled(controller, env)),
} satisfies ExportedHandler<Env>;
