import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { hitRateLimit } from "../services/rate-limit";

export const clientIp = (req: Request) => req.headers.get("CF-Connecting-IP") ?? "unknown";

/** Limit requests per visitor IP for one named action. Apply to POST routes such as login. */
export const rateLimit = (name: string, limit: number, windowSeconds: number) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const result = await hitRateLimit(c.env.DB, `${name}:${clientIp(c.req.raw)}`, limit, windowSeconds);
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.text("Too many attempts. Please wait a few minutes and try again.", 429);
    }
    await next();
  });
