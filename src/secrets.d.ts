// Secrets set with `wrangler secret put NAME --env <env>` (never in code). All optional:
// features that need one show a friendly "not set up yet" message when it's missing.
interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
}
declare namespace Cloudflare {
  interface Env {
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;
  }
}
