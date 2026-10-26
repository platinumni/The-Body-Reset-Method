# Going live (Step 9)

The test site is complete. These are the steps to launch. **Nothing goes live until the owner says "GO LIVE".**
Admin → **Launch checklist** shows what's still missing at any time.

## Owner: before launch (in any order)
1. ✅ **Domain bought (2026-10-26): `bodyregenerationmethod.com`**, on Cloudflare (zone active). The Kitchen lives at `kitchen.bodyregenerationmethod.com` (it redirects to `/kitchen`), and `www` redirects to the main address. Both are already handled in the code.
2. **Stripe live mode:**
   - Activate your account: business details and the bank account for payouts.
   - In live mode, create a **secret key** and a **webhook** to `https://YOURDOMAIN/webhooks/stripe`, with the same 8 events as in `STRIPE_SETUP.md`.
   - Add both to the live site in Cloudflare, as `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
3. **Email:** in Resend, add your domain and its DNS records (Cloudflare can add them in one click), then add `RESEND_API_KEY` to the live site.
4. **Your decisions in admin** (on the live site, after step 1 of Claude's list below):
   - prices,
   - affiliate commission % (or leave it closed),
   - the refund policy wording,
   - your coach story,
   - the remaining placeholders.
5. **Paperwork:**
   - ICO data protection fee.
   - Trademark check.
   - Insurance.
   - An accountant's view on EU VAT.
   - A solicitor's look at the legal pages (recommended).
6. Tell Claude: **"GO LIVE"**.

## Claude: launch steps (after "GO LIVE")
1. Create the live database and storage: `bodyregen-production` (D1), `bodyregen-backups` and `bodyregen-media` (R2). Add the `production` environment to `wrangler.jsonc` with `SITE_URL` set to the domain and `EMAIL_FROM` set to an address on the domain.
2. Generate `ADMIN_ENC_KEY` for production, stored only in Cloudflare.
3. Run `PRODUCTION_URL=https://YOURDOMAIN npm run deploy:production`. This runs the checks, backs up, migrates, deploys and does a health check.
4. Attach the domains to the Worker as **Custom Domains** (add `routes` to the production env): `bodyregenerationmethod.com`, `www.bodyregenerationmethod.com` and `kitchen.bodyregenerationmethod.com`. The Worker itself redirects www and kitchen (see `src/index.tsx`). Production vars: `SITE_URL=https://bodyregenerationmethod.com`, `EMAIL_FROM="The Body Regeneration Method <hello@bodyregenerationmethod.com>"`, and `GROWTH_ENGINE_URL` = the engine's live address (ask the owner). Secrets: `ADMIN_ENC_KEY`, `STRIPE_*`, `RESEND_API_KEY`, `GROWTH_ENGINE_KEY`, `PIXABAY_API_KEY`. Copy the recipe photos from the staging R2 to the live R2, and the `recipe_photos` rows too. Do **not** add the temporary `*/10` photo cron to production.
5. Run `bash scripts/admin-invite.sh production owner@email`. The owner sets a password and their authenticator app.
6. **Real test:**
   - buy a programme with a real card, priced at £1 for the test,
   - check the receipt and the account email,
   - open the programme,
   - refund it in admin and confirm access is removed,
   - set the real price.
7. Check that `robots.txt` allows indexing on the live site and the sitemap is correct. The owner then submits the sitemap in Google Search Console.
8. Remove the "draft" notes from the legal pages once they've been reviewed.

## After launch
- The weekly backup runs on Sundays, plus a backup before every live deploy.
- The morning report arrives daily around 6–7am UK time.
- Content changes go through the normal flow: Claude drafts, the owner checks on the test site or as a draft in live admin, then publishes.
