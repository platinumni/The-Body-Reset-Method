import { affiliateSettings } from "./affiliates";
import { listOnSale } from "./products";

// Go-live readiness: settings and keys that must be in place before launch.

export type Check = { label: string; ok: boolean; fix: string };

export async function launchChecks(env: Env): Promise<Check[]> {
  const onSale = await listOnSale(env.DB);
  const rate = (await affiliateSettings(env.DB)).ratePercent;
  const admins = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users u JOIN admin_mfa m ON m.user_id = u.id WHERE u.role = 'admin'").first<number>("n")) ?? 0;
  return [
    { label: "Stripe secret key is set", ok: !!env.STRIPE_SECRET_KEY, fix: "Add STRIPE_SECRET_KEY in Cloudflare (live key for the live site)." },
    { label: "Stripe webhook secret is set", ok: !!env.STRIPE_WEBHOOK_SECRET, fix: "Create the webhook in Stripe and add STRIPE_WEBHOOK_SECRET." },
    { label: "Email sending is set up", ok: !!env.RESEND_API_KEY, fix: "Add RESEND_API_KEY in Cloudflare." },
    { label: "Emails come from your own domain", ok: !env.EMAIL_FROM.includes("resend.dev"), fix: "Verify your domain in Resend and set EMAIL_FROM." },
    { label: "Admin two-step login is set up", ok: admins > 0, fix: "Log in to admin and set up your authenticator app." },
    { label: "At least one programme is on sale with a price", ok: onSale.length > 0, fix: "Admin → Programmes: set a price and choose 'On sale'." },
    { label: "Affiliate commission rate decided", ok: rate != null, fix: "Admin → Affiliates (or leave closed on purpose)." },
    { label: "Site address is the real domain", ok: !env.SITE_URL.includes("workers.dev") && !env.SITE_URL.includes("localhost"), fix: "Set at go-live (Step 9)." },
  ];
}

/** Find "[PLACEHOLDER: …]" text left on a rendered page. */
export function findPlaceholders(html: string): string[] {
  return [...new Set([...html.matchAll(/data-placeholder="true">([^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>)*[^<]*)<\/mark>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim()))];
}
