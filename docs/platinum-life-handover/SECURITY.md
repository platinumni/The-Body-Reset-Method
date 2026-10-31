# Accounts, security and data separation

## How Body Regen does it (verified; replicate the standards, using Platinum NI's own mechanisms)
- **Sessions:** a random token in an HttpOnly cookie; only its SHA-256 hash is stored. Passwords use PBKDF2. Admin needs TOTP two-step login.
- **Access to the planner:** a logged-in user with an un-revoked `entitlements` row for product `meal-plans`, or `role = 'admin'`. Every meal-plan route checks this (GET page and each POST). Otherwise it redirects to the product page.
- **CSRF:** `<CsrfField>` on every POST form (save, spend, favourite); middleware checks it. Rate limits: spend log 30 an hour, membership 10 an hour (and login and other sensitive posts).
- **Strict CSP:** `default-src 'self'; script-src 'self'; img-src 'self' data: …; connect-src 'self'; form-action 'self' …; frame-ancestors 'none'`. No inline scripts or styles, which is why recipe photos are self-hosted and admin previews are proxied.
- **Input cleaning:** `readPlanInput` allow-lists and clamps everything. Recipe ids are validated against the library (`recipeById`). The photo route only serves `^[A-Za-z0-9_-]{1,40}\.jpg$` from R2. Admin photo saves only accept `https://pixabay.com/` page URLs and Pixabay image hosts.
- **Health data:** allergy choices are **never stored** (UK GDPR special category). The calorie inputs are never submitted. The free week stores choices and recipe ids, never allergies.
- **UK GDPR:**
  - data export includes the meal prefs, spend log and favourites;
  - account deletion removes them;
  - the privacy policy has a meal-plans section (what's saved, that spend is used for the member's own savings and estimates, anonymous averages only);
  - no tracking cookies.
- **Staging** is always `noindex` (`X-Robots-Tag`). Staging and production have separate databases and buckets.

## Requirements for Platinum Life
1. **Use Platinum Life's existing user account and membership system.** No second login, and no copy of Body Regen's auth. Replace `canUseMealPlans` with Platinum Life's membership or entitlement check (**not verified**: inspect Platinum NI first). Admins (Platinum NI's admin role) can always open it.
2. **Data separation:**
   - Platinum Life's own D1 tables (`pl_meal_*`), its own R2 prefix or bucket, and its own secrets.
   - **No connection** to Body Regen's D1 `bodyregen-*`, R2 `bodyregen-*`, Worker, Stripe or Resend.
   - Never touch any `bodyregen-*` Cloudflare resource. (Body Regen's rules: never touch `platinumni*`, `ironworks-*` or `keystone-*` from Body Regen. The same separation applies both ways.)
   - Both projects share one Cloudflare account (`0db80beb5c1fff6eaf82105bdd1c543d`), so be careful with names and never run wrangler commands against the other project's resources.
3. Every POST gets Platinum NI's CSRF protection; meal routes get its auth middleware; spend logging is rate-limited.
4. Don't store allergies; keep the calorie estimate client-only.
5. Add the meal tables to Platinum NI's data export and account deletion.
6. Update Platinum NI's privacy policy with the meal-planner section (adapt Body Regen's wording in `src/views/legal.tsx`, "If you use the meal plans").
7. Keep Platinum NI's CSP. If it allows inline scripts, still prefer the external client script.
8. Admin photo tools: admin role only, audit-logged.
