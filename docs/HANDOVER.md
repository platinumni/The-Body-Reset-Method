# Handover — The Body Regeneration Method

_Last updated: 2026-10-24, after the full course build. **The build (Steps 1–7) and the first full course content are on the test site, as drafts.**_

## What this is
This is a worldwide (mainly UK) website selling online movement programmes by the owner, a coach.
- **Flagship:** Lower Body Regeneration. It works from the ground up: feet and balance → shins, Achilles and calves → hips and knees → integrate. It comes with **Core & Hips free**.
- **Philosophy:** release the tension, the forcing and the control, and learn to love your body again. The homepage hints at it; buyers get the full teaching.
- **Buying:** visitors buy without an account. Afterwards they get an emailed link to create an account, and they see only the programmes they've bought.
- **Each programme has four modes:** Full guide (one page at a time, with Next/Previous), Listen, Key points and a printable Exercise sheet.
- **Content:** text, YouTube video links and the owner's images.
- **Affiliates:** customers can share a personal link and earn commission. One level only.
- **Payments:** Stripe Checkout (card, Apple Pay, Google Pay, PayPal via Stripe). See `docs/DECISIONS.md`.

## Where things are
| What | Where |
|---|---|
| Code | GitHub `platinumni/The-Body-Reset-Method`, working branch `claude/clever-dirac-1c0vll` |
| Test site | https://bodyregen-staging.michaeljmarden.workers.dev |
| Live site | Not created yet (Step 9, after the domain is bought) |
| Cloudflare account | Owner's account `0db80beb5c1fff6eaf82105bdd1c543d` (shared with Platinum NI; don't touch `platinumni*`) |
| Test database | D1 `bodyregen-staging` |
| Test backups | R2 `bodyregen-backups-staging` |
| Test images | R2 `bodyregen-media-staging` |

## How to work on it
```bash
npm install          # .npmrc sets legacy-peer-deps (works round an npm 10 bug)
npm run dev          # local site at http://localhost:8787
npm run check        # must pass before every commit
npm run deploy:staging
npm run bundle       # code backup file in bundles/
```
In a Claude cloud session, Cloudflare auth comes through the proxy. Set `CLOUDFLARE_API_TOKEN=proxy-injected` and `CLOUDFLARE_ACCOUNT_ID=0db80beb5c1fff6eaf82105bdd1c543d` before running wrangler.
The sandbox can't open `*.workers.dev`, so deploy with `SKIP_HEALTH_CHECK=1 npm run deploy:staging` and ask the owner to open `/health`.

## What's built
**Step 1 — Foundation (done 2026-10-23)**
- **Stack:** Cloudflare Workers + Hono (server-rendered JSX), a D1 database, R2 backups, and a weekly cron (Sunday 03:00 UTC) that backs up the database and does housekeeping.
- **Security:** PBKDF2 password hashing, hashed session tokens, CSRF on all forms, rate limiting, strict security headers and CSP, an audit log service.
- **Data:** first migration (users, sessions, rate limits, audit log, consents, backups, settings). Migration safety check with a lock file.
- **Search engines:** robots.txt and sitemap. The test site is noindex.
- **Pages:** holding homepage, 404 and error pages, `/health`. CSS and the favicon are bundled into the Worker (`src/assets/`, served with content-hash URLs). We don't use Workers Static Assets, because asset uploads fail through the cloud session's proxy.
- **Deploying:** deploy script (checks → backup → migrate → deploy → health check) and a bundle script.
- **Tests:** 35 in the Workers runtime plus 7 for the migration check.

**Step 2: Look and public pages (done 2026-10-23)**
- **Design system** (`src/assets/styles.css`): warm, earthy palette with light and dark mode. Self-hosted Fraunces (display) and Inter (body) fonts. No JavaScript. The mobile menu and FAQs use `<details>`.
- **Pages:** `/`, `/method`, `/programmes`, `/programmes/lower-body-regeneration`, `/about`, `/faq`, and `/legal/{privacy,terms,cookies,refunds,health-disclaimer}`.
- **Content** lives in `src/content/site.ts`, wording from the owner (see `docs/METHOD.md`), read through `src/services/catalogue.ts`. It moves to the database in Step 5.
- **Placeholders:** `placeholder("…")` renders a yellow `[PLACEHOLDER: …]` mark. The test site shows a "Test site: not live" banner.
- **Search engines:** unique titles, descriptions and canonicals; Organization, WebSite, Course and FAQPage structured data; a sitemap of all pages.
- **Legal pages** are drafts, marked for owner and solicitor review.
- **Tests:** 71 in the Workers runtime plus 7 for the migration check. They cover every page, the strict CSP (no inline styles or scripts) and the structured data.

**Step 3: Shop (done 2026-10-23)**
- **Migration 0002:** products (seeded with the six programmes, **no prices**, all draft), bundle_items, orders, order_items, entitlements, email_tokens, stripe_events, email_log.
- **Basket:** a cookie holding product slugs only (`src/services/basket.ts`). Prices always come from the DB. Add-on suggestions skip programmes already inside a basket bundle.
- **Checkout** (`src/routes/shop.tsx`): three required tick boxes (health declaration, terms, immediate access / waiver of the 14-day right) plus optional marketing. The wording and version are in `src/content/consents.ts`. A pending order is created, then the shopper goes to Stripe Checkout (`src/services/payments/stripe.ts`, plain fetch, idempotency keys).
- **Webhook** `/webhooks/stripe`:
  - Signature verified, with a 5-minute replay window. CSRF-exempt.
  - Events are deduplicated.
  - The amount must match the order.
  - On payment: order paid, entitlements granted by email (linked to the user if one exists), consents recorded, a setup link created (7 days), and a confirmation email sent (Resend, logged in `email_log`).
  - A full refund revokes access. Expired sessions are marked.
- **Secrets needed:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`. Without them, checkout shows "not switched on yet" and emails are logged as skipped. Owner steps: `docs/STRIPE_SETUP.md`.
- **A product is only buyable** when `status = 'on_sale'` AND `price_pence` is set. Real prices come from the owner.

**Step 4: Members area (done 2026-10-23)**
- **Migration 0003:** `programme_lessons` (tab `full` or `quick`, position, title, body, YouTube id, image key, status) and `lesson_progress`.
- **Auth** (`src/routes/auth.tsx`, `src/services/accounts.ts`):
  - `/account/setup?token=` creates the account from the emailed link (single use, 7 days), marks the email verified and links all programmes bought with that email.
  - `/login` is rate limited per IP and per email, with the same timing for unknown emails.
  - `/logout`.
  - `/forgot` always gives the same answer. It sends a reset link (1 hour) to members, or a fresh setup link to buyers without an account.
  - `/reset` logs out all other devices.
  - **Admins can't log in here.** They're sent to `/admin/login`, which has two-step login (Step 5).
- **Session cookie:** `__Host-brm_session`, 30 days, `loadUser` on every request (DB hit only when the cookie exists).
- **Account** (`/account`): My Programmes with progress, marketing on/off (an append-only consent record each time), change password (logs out other devices), download my data (JSON), delete account (password confirm: personal details wiped, access revoked, orders kept 6 years for tax, audit logged).
- **Reader** (`/account/programmes/:slug?tab=full|quick`): only for owners with an unrevoked entitlement, and only published lessons. It has a "read this first" notice, contents, YouTube nocookie embeds, images via `/media/*` (owners only, R2 `MEDIA` bucket), and mark-as-done.
- **Lesson text** uses a safe mini-format (`src/lib/markdown.tsx` → JSX, never raw HTML): `##` headings, `-` lists, `1.` numbered, `>` key points, `**bold**`, `*italic*`, `[links](https://…)`.

**Step 5: Admin (done 2026-10-23)**
- **Migration 0004:** admin_mfa (encrypted TOTP secret + last used step), admin_backup_codes (hashed), login_challenges, revisions (undo history), daily_stats (anonymous), and `sessions.mfa_verified`.
- **Admin login** `/admin/login`:
  - password → 5-minute challenge cookie → 6-digit authenticator code or a one-time backup code.
  - First login: QR code plus a tap-to-add link for phones → confirm a code → 10 backup codes shown once.
  - Admin sessions last 12 hours, and `requireAdmin` needs `role = admin` **and** `mfa_verified = 1`.
  - Non-admins get a 404.
  - `/login` refuses admins.
- **Creating an admin:** `bash scripts/admin-invite.sh staging owner@email` prints a single-use 24-hour setup link (and ends any existing sessions for that person).
- **`ADMIN_ENC_KEY` (secret, set on staging):** it encrypts authenticator secrets. **Never change it**, or admins must re-enrol. If it's lost: clear that admin's `admin_mfa` row (via `wrangler d1 execute`) and they re-enrol at next login.
- **Pages:**
  - Dashboard (sales 7/30 days, members, needs-attention list).
  - Programmes: create programmes or bundles, title, price, status, order, bundle contents, duplicate, history and restore.
  - Lesson editor: tab, status, title, text with format help, YouTube link, image upload (type-sniffed, 5 MB, R2), live preview, move up/down, duplicate, history and restore.
  - Orders: search, detail with consents, refund via Stripe (confirm tick), remove access, give free access (£0 GIFT order plus email).
  - Customers: search, CSV (formula-injection safe), delete account.
  - Site wording: homepage headline and intro, coach name and story, programme short descriptions, FAQs (Q:/A: format). Saved in `settings`, every change revisioned. `[PLACEHOLDER: …]` text stays highlighted.
  - Stats: 30-day views, top pages, shop steps. Counted server-side with no cookies or IPs; bots and admin excluded.
  - Activity log, Backups (with "Back up now"), Emails.
- **Every admin action** writes to `audit_log`.

**Wording pass (2026-10-23):** fuller, more professional copy. The philosophy text is in `WHY`, the flagship "everything starts at the feet" text is in `FOUNDATION` (`src/content/site.ts`), and the headline is now two lines. A track record line (option 1, "Shared freely with thousands of people around the world for years…") is on the homepage and the flagship page (`TRACK_RECORD`, editable as `home.track_record`). The owner keeps the evidence (see `docs/METHOD.md`).

**Step 6: Affiliates (done 2026-10-23)**
- **Migration 0005:** affiliates, affiliate_clicks (anonymous daily counts), payouts, commissions (one per order).
- **Closed until the owner sets a rate** (Admin → Affiliates). Settings: rate %, hold days (default 30), minimum payout (default £10).
- **Joining:** a member who owns a programme ticks the affiliate terms (a consent record is kept) and gets `/r/CODE`. The card shows visits, sales, on hold, owed and paid, plus #ad guidance and a payout email.
- **Share link:** `/r/CODE?to=/path` counts the click and adds `?ref=`. The site then **asks** before storing the `brm_ref` cookie (30 days), because PECR requires consent. Buyers can also type a code at checkout (a typed code wins).
- **Commission:** created when payment is confirmed. There's none for self-referral, a paused link or a closed programme. **One level only.** A refund cancels unpaid commission (already-paid commission is logged as a warning).
- **Daily cron** `0 4 * * *` moves commission from pending to approved after the hold.
- **Admin:** list with totals, "Record payout" once the owner has actually paid by PayPal or bank (marks the exact commissions as paid), pause or reinstate links.
- **Account deletion** pauses the link, and the data export includes affiliate data.
- `/legal/affiliate-terms` covers one level, #ad disclosure, no health claims, no brand bidding and suspension.

**Step 7: Automation (done 2026-10-23)**
- **Migration 0006:** campaigns, campaign_sends (never twice), automation_sent (each automatic email once).
- **Daily cron** `0 6 * * *` (6–7am UK). Each step is isolated, so one failing doesn't stop the rest:
  1. release held commission and email the affiliates,
  2. account-setup reminder (2 days after paying, once),
  3. 7-day check-in tips email (once),
  4. usage watch (email to admins at 80% of the email limit, default 3,000 a month, or the page-view limit; once a month),
  5. the **morning report** to every admin: yesterday's sales, members and views, plus a needs-attention list.
- **No paid AI is used.** The report is built from the database, so the AI cost is £0.
- **Campaigns** (Admin → Email campaigns): draft, preview, send a test to self, send once to everyone whose latest marketing consent is yes. Sent in Resend batches of 100, with List-Unsubscribe and List-Unsubscribe-Post (one-click) headers.
- **Unsubscribe:** `/unsubscribe?e=&t=` uses an HMAC token keyed on `ADMIN_ENC_KEY` and is CSRF-exempt, so mail apps can POST to it. It records an append-only consent row.
- **Dashboard usage box.** **Admin → Launch checklist** lists missing keys and settings, plus every `[PLACEHOLDER]` left on public pages.
- **No approval queue:** nothing on this site changes content automatically. All content changes are made by the owner or Claude as drafts, and the owner publishes them. Add one if an automatic content job is ever introduced.

**Final build: marketing and SEO (2026-10-23)**
- **Migration 0007:** `subscribers` (double opt-in sign-ups) and `orders.amount_paid_pence`.
- **Discount codes:** Stripe Checkout has `allow_promotion_codes`. The owner creates coupons in Stripe. The webhook checks `amount_subtotal` = order total and paid ≤ total, then stores the paid amount. Commission and dashboard sales use the paid amount, and the receipt shows a discount line.
- **Sign-up** (`src/routes/marketing.tsx`, `src/services/subscribers.ts`):
  - `POST /subscribe` has a honeypot, rate limits and the same answer for every address.
  - It sends a confirmation email. `/subscribe/confirm` records the marketing consent and sends the welcome email (offer code if set, plus a guides link).
- **Pop-up:** a `<dialog>` rendered on marketing pages for logged-out visitors, opened by `/app.js` (`src/assets/client.ts`, the site's only JS) after 25 seconds or 55% of the page, once per visitor (localStorage). It works without JS too, through the inline `SignupBox`.
- **Owner-editable** (Site wording): offer headline, code and small print (empty means no offer), and testimonials (a section shows only when there's at least one).
- **Conversion sections** (`src/views/marketing.tsx`): trust strip, how it works, "Is this you?" (flagship), buy block under the programme hero, FAQ teaser, and a sticky phone buy bar.
- **SEO:**
  - `/guides` plus 3 guide articles (`src/content/guides.ts`, drafted by Claude for owner review), with Article and BreadcrumbList data.
  - Course `offers` when on sale.
  - Keyword titles and descriptions.
  - `og:image` (`/og.png`, 1200×630, made from the brand) and a Twitter large card.
  - Guides in the sitemap and the nav.
- **Bugs fixed:**
  1. String constants exported from `src/index.tsx` stopped the real Workers runtime from starting (from Step 6). They're moved to `src/cron.ts`, and `test/entry.test.ts` guards against it.
  2. Pages had no `<!DOCTYPE html>` (quirks mode). Both layouts now emit it, and a test checks.

**Step 8 started: course content (2026-10-24)**
- **Programme content lives in the repo** at `content/programmes/<slug>/*.md` (front matter: key, tab, position, title, status, youtube). It's loaded with `node scripts/import-content.mjs staging|production [--update]` (see `content/programmes/README.md`).
- **Migration 0008** adds `programme_lessons.content_key` (unique). Imports never duplicate. Existing sections are only changed with `--update`, which saves their previous version to `revisions` first.
- **Lower Body, so far:**
  - "Read this first" and "The six principles" (Full tab), written from the owner's voice notes,
  - "Key points: philosophy and principles" (Quick tab),
  - a placeholder skeleton for the 4 stages in both tabs.
  - Everything was imported to staging as **drafts**.
- **Website:** the six principle summaries were sharpened (Recognise both ways, layered Release, Integrate with dual-task training). The method page has a new "The principles in more depth" section (`PRINCIPLES_DEPTH`), and the six-principles guide was updated.
- **Gotcha:** never stop the dev server with `ps | grep … | kill` or `pkill -f`. The pattern matches the command's own shell and kills it. Use `pkill -x workerd`.

**Course structure (2026-10-24)**
- **Migration 0009:** lessons can be `kind = 'exercise'`, with `stage`, `starting_position`, `conducting`, `key_points`, `recommended_time` and `sheet_line`. Sections can carry a `stage` too, as a stage intro.
- **Members choose one of four modes:** `/account/programmes/:slug?mode=guide|listen|points|sheet`. Old `?tab=` links still map across.
  - **Full guide:** Full-tab sections, then exercises grouped under stage headings. Each exercise shows Starting position (with a "most important part" note), then Conducting the exercise, the suggested time with the "tune in to your body" wording, and the demo video with a "shows the movement only" label.
  - **Listen:** a Play button per item, using the device's built-in voice (`/reader.js`, speechSynthesis, sentence by sentence, with speed and stop). It's free, with no API.
    - Upgrades possible later: recorded AI voice files or translations. The Cloudflare token here has no Workers AI permission.
  - **Key points:** Quick-tab sections plus each exercise's key points, with the video collapsed.
  - **Exercise sheet:** exercises only (no philosophy), as an A4 print stylesheet, with a "Print or save as PDF" button.
- **Admin lesson editor** has a Type selector and all the exercise fields. The import script supports `kind: exercise`, with body parts split on `## Starting position`, `## Conducting the exercise` and `## Key points`.
- **Content:** each stage now has an "About this stage" placeholder section. There's an exercise template in stage 1 (`11-exercise-template.md`). The old Quick-tab stage placeholders are archived.

**Full course build (2026-10-24)**
- **Migration 0010:**
  - adds `watch_for` and `levels` to lessons;
  - adds the **Core** programme and the **Core & Hips** bundle (Hips + Core), both draft with no price;
  - links Hips and Core to Lower Body as **free bonuses** through `bundle_items` on the programme.
- **How the bonus works:** `programmesUnlockedBy()` returns a programme plus its bonus items. Buying Lower Body grants three programmes. The basket won't suggest Core & Hips, Hips or Core to someone already buying Lower Body. Hips and Core can each still be sold alone later, by giving them a price and setting them on sale.
- **Reader:**
  - The Full guide is **paged**, one item per page (`?mode=guide&item=N`). It has big Previous/Next buttons, an "N of M" count, a progress bar and a "Jump to" list (auto-submits with JS, with a Go button without it). "Mark as done and continue →" moves to the next page.
  - Exercise parts are drop-downs with arrows: Starting position and Conducting are open; What to watch for, Easier and harder versions, and Key points are closed.
  - The text-size control (A−/A+) is remembered on the device (localStorage). `/reader.js` now loads in every mode.
  - All times show as "Advised". The exercise sheet carries the note "you should already have a full understanding of the movement philosophy" and the advised one-round-a-day line.
- **Content:** in `content/programmes/`, imported to staging as **drafts**.
  - **Lower Body:** read this first (updated), the six principles, how to run a round, and 4 stage intros. Then 11 exercises (pogo hops split into part 1 and part 2), followed by "Strengthen and reintegrate" and "What next". The old template exercise key was reused for Short foot.
  - **Hips:** an intro, part 1 (6 openers) and part 2 (4 strength exercises).
  - **Core:** an intro, part 1 (7 breath and deep-core foundations), part 2 (dead bug, bird dog, front plank, side plank) and "What next".
  - Every exercise has: starting position, conducting, what to watch for, Beginner/Intermediate/Advanced, key points, an advised time and a sheet line.
  - A script test checks every exercise is complete and that no file uses cure/heal/treat/fix, lymphatic, reflexology or DNS wording.
- **Website:**
  - New stage list on the flagship.
  - A Core & Hips page (price placeholder; parts shown as a numbered list).
  - Hips and Core listed separately as "coming soon".
  - On the method page: "Engage, but don't grip" (wu wei) and the four stages of learning.
  - FAQs for equipment, time and frequency, and the free bonus.
  - Emails and copy updated from "Full Programme / Quick Run-Through" to the four modes.
- **Admin:** the lesson editor has the What to watch for and Easier and harder versions fields.

**Owner review round 1 (2026-10-24, voice notes 19 to 30)**
- **Content rewritten** in a more polished voice.
  - Number ranges use a plain hyphen ("8-10"), never an en dash (the owner felt it looked AI-written). A script test enforces this.
  - Every starting position follows the same order: nudge gently, release, engage only what's needed, release again and maintain ("almost floating").
  - Short foot stresses toes long and fully loose.
  - The single-leg balance and the Release example now cover stacking up the spine and the toe grip as the consciously competent stage, then releasing it.
  - Each Advanced level explains the layered awareness and the problems to expect.
  - Retrain and Strengthen are split into separate sections.
  - Integrate covers everyday life and sport.
  - "Advised" is framed as not another system: a baseline, no rush, no shame, no ego.
  - First-read times: Lower Body about 45 minutes, Hips and Core about 20 minutes each. Each intro also gives the time for a round once understood.
  - Access is **lifetime** (owner, 2026-10-24): on the programme pages, FAQ and terms.
  - "Strengthen and reintegrate" became "Beyond the programme: letting go of it" (same key). It lists the practices always worth keeping, including a skipping rope.
  - Hips gained a "What next" page.
- **Reader:** each exercise with a video gets a line near the top saying the video is at the bottom (with a link), and that it shows the movement only.
- **Website:**
  - Hips and Core each have their own buy page (price placeholders).
  - Every page except the flagship carries a "Start with the flagship" card (`FLAGSHIP_POINTER`). Wording confirmed by the owner (2026-10-24): the flagship is the access point to all programmes.
  - Method page and FAQ updated to match.
- **Content generators:** the scripts that write `content/programmes` live in the session scratchpad only; the `.md` files are the source of truth.

- **Letting go, in the body and in life** (owner, 2026-10-24): a passage in Lower Body "Read this first" (after wu wei) that runs from the wrong control, to good control, to trust (reflexes, body, the process, yourself). It's written for everyone, with no religious terms, and has a short reprise at the start of "Beyond the programme". The round time once understood (`ROUND_TIME` in `src/views/account.tsx`) shows in the How to use box and on the exercise sheet.
- **On and off: the real skill** (owner, 2026-10-24): Lower Body "Read this first" sets out four steps: switch off the wrong control, learn the right control from the ground up, release even that, then switch it on and off at will. It's echoed in "Beyond the programme", the key points and the method page. The owner was unsure about "control and surrender", so the text uses "control and release".

**Guarantee, contact form, affiliate paydays (2026-10-24)**
- **90-day money-back guarantee** on every programme (`GUARANTEE` in `src/content/site.ts`). It appears in the trust strip, a FAQ, the refund policy and the terms. The checkout tick now ends "My 90-day money-back guarantee still applies" (consent version 2026-10-24).
- **Contact form** at `/contact` (footer link):
  - CSRF, a rate limit of 5 per 15 minutes, a honeypot field, and validation.
  - **Migration 0011** adds `contact_messages`. Every message is saved and shown in **Admin → Messages** (mark as handled, audited).
  - It also emails the address set in Site wording → "Contact form: send messages to", once `RESEND_API_KEY` exists. No address is set yet; the owner may create a new Gmail.
  - Messages are included in the data export and deleted with the account.
- **Affiliates:**
  - The hold defaults to **90 days**.
  - Payday is the **last working day of the month** of release: weekends are skipped, and so are Good Friday, Easter Monday and the late May and August bank holidays (`src/lib/paydays.ts`).
  - The next payday shows on the affiliate card and in Admin → Affiliates. The affiliate terms are updated.
- **On/off control:** at first conscious, then even the switch becomes unconscious (Read this first, Beyond the programme, key points).

## Working with the owner (learned so far)
- They're usually on a phone, so keep replies short and plain. **Workflow:** a short brief, then the owner replies "CH", then work quietly, then a short report. When they send a run of voice notes and say "just say continue", reply only "Continue" until CH.
- **After each change, send only the code backup bundle** (`bash scripts/make-bundle.sh <scratchpad>`). No screenshots unless asked.
- **Writing style:**
  - Number ranges use a plain hyphen ("8-10"), never an en dash; the owner finds it looks AI-written.
  - Polished, assured, warm. It should speak to the person, with no hype.
  - Education only: no cure, treat or fix claims. No DNS or Prague School material. "Reflexes", not "reflexology".
- **Philosophy keywords:**
  - release, then the right muscles, then release even those, then trust the reflexes;
  - engage, don't grip; position over range; wu wei;
  - the four stages of competence;
  - control on and off, until even the switch is unconscious;
  - "advised", not another system; no shame, no ego.
- **Preview accounts on staging:** see "Next step". The course is published on staging only. A content `--update` import resets staging to draft, so re-run the publish SQL afterwards: `UPDATE programme_lessons SET status='published' WHERE content_key IS NOT NULL AND status='draft'`.
- **Owner's voice-note captures:** `docs/owner-notes/`.

## Decisions made in chat (2026-10-24/25)
- **Pricing:** to be decided. The owner mentioned 29.99 for Lower Body (£ or $ still to confirm). Core & Hips, Hips and Core each have their own buy page. Lower Body includes Core & Hips free.
- **Access:** lifetime.
- **Guarantee:** 90-day money-back on every programme, no conditions, with "we recommend giving it a proper go".
- **Affiliates:** commission held 90 days, then paid on the last working day of that month. Payouts are **manual** (no Stripe Connect for now). The commission % is not set yet.
- **Business:** go live as a sole trader, with Stripe paying into the owner's personal bank account. Move to the owner's existing Ltd later (update the legal pages then).
  - Legal pages need: name ("trading as"), postal address (a virtual office is fine), contact email.
  - The £1,000 trading allowance and HMRC registration were explained; the owner will check with an accountant.
- **Email:**
  - Use a separate free Resend account for this business (Platinum NI already uses one).
  - Cloudflare Email Routing (free) to forward hello@domain into a new business Gmail. No paid inbox.
  - The contact form email is parked until the Gmail exists.
- **Cloudflare:** keep the shared account with Platinum NI (never touch `platinumni*`). The $5 a month paid plan covers both if ever needed. Running cost is £0 to start, about £20 a month when busy.
- **Marketing:**
  - The owner dislikes hype. Suggested approach: calm, real phone videos showing grip versus release; teach one free thing (short foot); real testimonials; coaches in golf, martial arts and running via affiliates; longer YouTube videos.
  - The owner may ask for a marketing plan (about 1 hour).
- **Later or optional:** Stripe Connect automatic payouts; premium AI voiceover (owner picks from samples); the owner's own photos of the starting positions.

## Next step
- **Planned: go live Monday 2026-10-26**, as a sole trader with Stripe paying into the owner's personal bank account. Switch to the owner's Ltd later (the legal pages need about 15 minutes of updates then).
  - Needed from the owner: domain, Stripe, prices, legal details (name "trading as", postal address, contact email), Resend and the ICO fee.
  - Preview accounts on staging: `michaeljmarden+preview@gmail.com` (owner, set up) and `michaeljmarden+brother@gmail.com` (setup link sent 2026-10-25, unused at the time).
- **2026-10-24: the course is published on staging only**, at the owner's request, so they can preview it on their phone. Their preview member account is `michaeljmarden+preview@gmail.com` (order `OWNER-PREVIEW`, £0, no payment). Their main account is the admin one, which needs 2FA. The content files still say `status: draft`, so a later `--update` import will set staging back to draft unless the files are changed to `published` first.
- The owner reviews the course (screenshots, or drafts once admin login exists) and the YouTube links.
- Publish the drafts on staging once the owner approves. In admin, or set `status: published` in the files and run `node scripts/import-content.mjs staging --update`.
- Then **Step 9 (go live):** see `docs/GO_LIVE.md`.
