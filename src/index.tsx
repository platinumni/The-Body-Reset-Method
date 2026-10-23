import { Hono } from "hono";
import type { AppEnv } from "./env";
import { csrf } from "./middleware/csrf";
import { securityHeaders } from "./middleware/security";
import { assetRoutes } from "./routes/assets";
import { pageMeta } from "./routes/meta";
import { publicRoutes } from "./routes/public";
import { shopRoutes } from "./routes/shop";
import { backupDatabase } from "./services/backup";
import { pruneRateLimits } from "./services/rate-limit";
import { NotFoundPage, ServerErrorPage } from "./views/errors";

export const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("*", csrf);

app.route("/", assetRoutes);
app.route("/", publicRoutes);
app.route("/", shopRoutes);

app.notFound((c) => c.html(<NotFoundPage meta={pageMeta(c, { title: "Page not found", description: "Page not found.", path: c.req.path, noindex: true })} />, 404));

app.onError((err, c) => {
  console.error("Unhandled error", { path: c.req.path, err: String(err), stack: err instanceof Error ? err.stack : undefined });
  return c.html(<ServerErrorPage meta={pageMeta(c, { title: "Something went wrong", description: "Error.", path: c.req.path, noindex: true })} />, 500);
});

/** Scheduled jobs. Weekly (Sunday 03:00 UTC): database backup + housekeeping. */
export async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  if (controller.cron === "0 3 * * SUN") {
    await backupDatabase(env.DB, env.BACKUPS, "weekly");
    await pruneRateLimits(env.DB);
  }
}

export default {
  fetch: app.fetch,
  scheduled: (controller, env, ctx) => ctx.waitUntil(scheduled(controller, env)),
} satisfies ExportedHandler<Env>;
