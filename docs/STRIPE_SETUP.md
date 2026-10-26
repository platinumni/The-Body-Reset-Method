# Stripe and email setup (owner, about 15 minutes)

Keys go **straight into Cloudflare**. Never paste them into chat, email or code.

## A. Stripe test mode (for the test site)
1. Sign up at **stripe.com** (free). Keep **Test mode** switched on (toggle at the top).
2. Go to **Developers** (sometimes shown as "Workbench") → **API keys**. Copy the **Secret key**. It starts `sk_test_`.
3. Add it to Cloudflare:
   1. In Cloudflare, go to **Workers & Pages** → **bodyregen-staging** → **Settings** → **Variables and Secrets** → **Add**.
   2. Set **Type** to **Secret**, **Name** to `STRIPE_SECRET_KEY`, and paste the key as the **Value**.
   3. Tap **Deploy**.
4. Back in Stripe, add a webhook:
   1. Go to **Developers** → **Webhooks** → **Add endpoint**.
   2. **Endpoint URL:** `https://bodyregen-staging.michaeljmarden.workers.dev/webhooks/stripe`
   3. **Events:** `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created` (chargebacks: cancels or deducts the partner's commission)
   4. Save it, then open the endpoint and **reveal the Signing secret**. It starts `whsec_`.
5. Add that to Cloudflare the same way, with the name `STRIPE_WEBHOOK_SECRET`.
6. Optional: to offer PayPal, go to Stripe **Settings** → **Payment methods** and turn on **PayPal**.

## B. Email (Resend)
1. At **resend.com**, go to **API Keys** → **Create**, and copy the key.
2. Add it to Cloudflare for **bodyregen-staging** with the name `RESEND_API_KEY`.

Until the domain is bought, test emails only reach the email address the Resend account is registered with.

## C. Tell Claude "keys in"
Claude then:
- sets a **£1 test price** on the test site only,
- runs a pretend purchase with Stripe's test card (`4242 4242 4242 4242`),
- checks the email, the access and a refund.

## At go-live (Step 9)
Repeat A and B for the live site, using Stripe's **live** keys and a webhook to the real domain. Claude gives you the exact list at that point.
