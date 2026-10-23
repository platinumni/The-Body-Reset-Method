import type { SessionUser } from "./services/sessions";
import type { SiteContent } from "./services/site-content";

/** Shared Hono typing: Cloudflare bindings plus per-request variables set by middleware. */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    csrfToken: string;
    /** Set by loadUser on member/admin routes; null when logged out. */
    user: SessionUser | null;
    /** Owner-editable wording, loaded once per public page request. */
    siteContent?: SiteContent;
  };
};

export const isProduction = (env: Env) => env.APP_ENV === "production";
export const isDevelopment = (env: Env) => env.APP_ENV === "development";
