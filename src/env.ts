import type { SessionUser } from "./services/sessions";

/** Shared Hono typing: Cloudflare bindings plus per-request variables set by middleware. */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    csrfToken: string;
    /** Set by loadUser on member/admin routes; null when logged out. */
    user: SessionUser | null;
  };
};

export const isProduction = (env: Env) => env.APP_ENV === "production";
export const isDevelopment = (env: Env) => env.APP_ENV === "development";
