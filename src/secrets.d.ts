// Secrets set with `wrangler secret put NAME --env <env>` (never in code). All optional:
// features that need one show a friendly "not set up yet" message when it's missing.
interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  /** 32 random bytes, base64: encrypts admin authenticator secrets. */
  ADMIN_ENC_KEY?: string;
  /** Growth engine events address (a var in wrangler.jsonc) and its reporting key (a secret). */
  GROWTH_ENGINE_URL?: string;
  GROWTH_ENGINE_KEY?: string;
  /** Pixabay API key, for choosing recipe photos in admin. */
  PIXABAY_API_KEY?: string;
}
declare namespace Cloudflare {
  interface Env {
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;
    ADMIN_ENC_KEY?: string;
    GROWTH_ENGINE_URL?: string;
    GROWTH_ENGINE_KEY?: string;
    PIXABAY_API_KEY?: string;
  }
}
