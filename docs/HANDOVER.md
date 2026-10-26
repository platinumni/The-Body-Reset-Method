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
- **After each change or chat decision:** write it into this file (decisions) or `docs/owner-notes/` (voice notes), then commit and push. **Don't send backups during the day.** The latest two bundles go only in the daily drop (about 6:48pm UK time), or when the owner asks. No screenshots unless asked. This is also in `CLAUDE.md`.
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

## Decisions made in chat (2026-10-24/25/26)
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
- **Daily backup (2026-10-25):** a scheduled task (`trig_01RcF5wxZim32iud4dWZppvy`) fires into this session every day at 18:48 UK time. It records any new chat decisions, then, only if something changed, sends the latest two backups.
- **Backups:** any change counts, even a small chat discussion, and goes into the daily drop.
- **Idea discussed, not agreed to build (2026-10-25): budget meal plans.**
  - The owner's idea: £20-£60 a week (UK, US and so on). The user enters a postcode or country and their usual supermarkets; prices are tracked weekly; the site shows the plans they can afford.
  - Claude's advice: UK supermarkets have no public price feed, and scraping breaks their terms, so don't scrape.
  - The free route: official monthly average prices (ONS in the UK, BLS in the US), a supermarket-type adjustment (discounter or premium), OpenStreetMap for nearby shops, and optional prices reported by users. Show estimates, not live prices. Kroger (US) has a free price API. Paid price data could come later.
  - Running cost about £0; build about 2-3 days (worst case a week).
  - Keep it to general healthy eating with allergen warnings and no weight-loss claims.
  - Claude asked whether to add it to the roadmap; no answer yet.
- **Meal plans: agreed to build later (owner, 2026-10-25). The owner will send a variety of meals first.** Decisions so far:
  - **Budget:** any amount from £20 to £100+, to the pound. If the budget is too low, show the lowest-cost week we can make ("lowest-cost", not "cheapest").
  - **Countries:** UK, then US and Canada, then Europe in stages. EU sales wait until VAT is sorted.
  - **Prices:** official averages: ONS (UK), BLS (US, with region), Statistics Canada. Updated monthly, adjusted by supermarket type. Every plan and PDF states the source and month, and says actual prices vary. No postcode needed.
  - **Household:** number of adults (teenagers count as adults) plus each child's age, or just "children". Standard portions by age from official guidance. No weights; babies under 1 are excluded (point to NHS weaning advice); toddler safety note.
  - **Weight:** every plan is maintain-weight. The note says: to gain or lose, speak to a GP, registered dietitian or registered nutritionist. An optional calorie calculator for one adult, worked out on the phone and not stored.
  - **Leave-outs:** quick buttons (no meat, no fish, no pork, vegetarian, vegan, dairy-free), plus type-to-search across all ingredients. Remembered on the account.
  - **Allergens:** the 14 UK allergens tagged per ingredient, which the owner checks. It's a filter, not a guarantee; every plan says "always check labels".
  - **Legal:** no medical or disease claims, no nutrition or health claims; show facts only (calories, protein, carbs, fat, fibre from official data). A word check blocks claims. Owner's own social posts: share experience, no medical claims.
  - **Output:** a personalised plan and a downloadable PDF; lifetime access to every budget level.
  - **Meals needed:** a minimum of about 60 (10 breakfasts, 15 lunches, 20 teas, 15 snacks); ideally about 90. About a third vegetarian, with a mix of budget staples and treat meals.
  - **Cheap staples** for people on tight budgets, but every meal always has its **full ingredient list** with amounts, including oil, seasoning and spices. Cupboard items are costed per use (owner, 2026-10-25).
  - **Already have it:** the shopping list splits into "to buy" and "cupboard" (oil, spices, salt and so on). Users tick what they already have, and it comes off the list and the cost. A one-off "starter cupboard" cost is shown separately (owner, 2026-10-25).
  - **PDF design:** it must look beautiful and on-brand. Page 1 is a cover: "The Body Regeneration Method, Meal Plan", their budget, household and dates. Then the week at a glance, recipes, the shopping list (to buy, and cupboard), and the source note. The design is a template kept separate from the data, so it can be restyled any time without losing anything (owner, 2026-10-25).
  - **Recipe catalogue received (2026-10-25):** `content/meal-plans/recipe-catalogue-2026-10-25.json`.
    - 140 recipe concepts (names only, `concept_unverified`): 25 breakfasts, 30 lunches, 60 evening meals, 25 snacks.
    - Three tiers: affordable staples (60), premium everyday (50), luxury (30). Diets: 55 vegan, 43 vegetarian, 21 pescatarian, 21 omnivore.
    - Still needed for each: ingredients with amounts, method, servings and real timings ("15 min" labels untested).
    - Images are not chosen yet; Wikimedia photos must be checked for dish match and licence.
    - Flags: #011 aubergine parmigiana and #120 pesto pasta salad use parmesan, which is usually made with animal rennet, so they're not strictly vegetarian unless a vegetarian hard cheese is specified.
    - **Full recipe drafts written by Claude (2026-10-25, owner asked):** `content/meal-plans/recipes/batch-1..4.txt`, in a simple format: R/I/M/N lines, with "c" marking cupboard items.
      - `node scripts/build-recipes.mjs` merges them with the catalogue into `content/meal-plans/recipes.json`. It tags the 14 UK allergens by keyword (for the owner to check), sets the timing labels from the real prep and cook times, and fails if a recipe is missing or a diet label doesn't match its ingredients. A script test enforces this.
      - #011 and #120 are fixed: vegetarian hard cheese, and vegetarian pesto.
      - Status: `draft_for_owner_review`. The owner should check the recipes, amounts and allergens before anything goes live.
      - Nothing in the meal-plan system has been built yet.
  - **Running cost:** about £0. Build time is to be confirmed once the meals arrive (about 3-4 days for the full version).
- **Logo:** the owner wants a proper logo for the site, PDFs and emails at some point. Options: their own designer, or Claude drafts simple versions to choose from.
- **US and Canada (discussed 2026-10-25):** no subdomain needed for currency. One site; the planner already shows $ and C$. For payments, use Stripe Adaptive Pricing, or set fixed USD and CAD prices (about half a day).
  - Official data: BLS (US, monthly, national, 4 regions and some cities, not by state) and Statistics Canada (monthly, national and by province), both free.
  - The official lists cover only about 40-70 common foods. Use official prices where they exist; adjust the rest of the estimates monthly by official food price changes.
  - Planned: a US region picker and a Canada province picker.
- **Network allow-list (owner added 2026-10-26, environment "Default", Limited).** OURS, for this project:
  - photos: unsplash.com, images.unsplash.com, api.unsplash.com, pexels.com, www.pexels.com, images.pexels.com, api.pexels.com;
  - prices: ons.gov.uk, www.ons.gov.uk, api.beta.ons.gov.uk, api.bls.gov, www.bls.gov, www150.statcan.gc.ca;
  - nutrition: assets.publishing.service.gov.uk, api.nal.usda.gov.
  The six other entries already in the list belong to another of the owner's projects; don't touch them. Remove ours when the photo, price and nutrition jobs are done (the live site fetches prices itself).
- **Socials (owner's plan):** official Instagram and other accounts for The Body Regeneration Method and for Body Regeneration Kitchen.
  - Claude advised against bot or fake accounts, and against automated follows, likes, comments or cold DMs (ban risk; hidden advertising), even with approvals.
  - Use official APIs only for scheduling, replying to comments on our own posts, and replying to people who DM first. Cold outreach is drafted and queued, and the owner sends it by hand. Use real affiliates and creators with #ad.
  - Claude gave the owner a paste-ready brief with questions for their growth engine chat.
- **Idea discussed, not built: macro mode for meal plans.**
  - Nutrition per recipe from UK food composition tables and USDA FoodData Central. The user enters height, weight, age, sex and activity, or their own macro targets; the planner sizes portions to hit targets within budget.
  - Keep: maintain-weight default, minimum calorie limits, GP or dietitian notes, not for under-18s, pregnancy or eating disorders, worked out on the phone and not stored unless chosen, approximate figures, no "lose X kg" marketing.
  - About 2-3 days. Waiting for the owner's CH, ideally after prices and photos.
- **Kitchen marketing:** "Body Regeneration Kitchen" stays on the same website for now (cross-promotion both ways), as a sub-brand at kitchen.<domain>; its own domain later if it takes off. The owner sees it as a possible standalone business. Advice: launch inside the site first, watch usage, then spin it out.
- **Domain plan:** the owner will buy bodyregenerationmethod (.com, and .co.uk if available) on Cloudflare and send the name. Claude then sets up www, the redirect, kitchen., hello@ forwarding, Resend DNS and the SEO update.
- **Later or optional:** Stripe Connect automatic payouts; premium AI voiceover (owner picks from samples); the owner's own photos of the starting positions.

**Budget meal plans built (2026-10-25, owner CH; on staging, product in draft with no price)**
- **Migration 0012:** product `meal-plans` (draft) and `meal_plan_prefs` (saved choices; included in export and deleted with the account).
- **Recipes:** `content/meal-plans/recipes.json` (built by `scripts/build-recipes.mjs`), loaded by `src/lib/meal-plans/recipes.ts`.
- **Prices:** `src/lib/meal-plans/prices.ts` holds about 200 estimated UK mid-range prices, labelled as estimates, `PRICES_AS_OF` October 2026.
  - Country factors: US ×1.3 USD, Canada ×1.75 CAD. Store factors: discount 0.85, premium 1.3.
  - **To connect ONS, BLS and Statistics Canada later,** replace the prices in that file, or load them from the database, once the hosts are allowed. Every ingredient must match an item; a test enforces this.
- **Planner:** `src/lib/meal-plans/planner.ts` (pure).
  - Portions by age (babies excluded). Filters for diet, leave-outs and allergens; leftover-only recipes are skipped.
  - Tries variety levels from 3/4/5/3 down to 1/2/2/1 different breakfasts, lunches, dinners and snacks, and keeps the fullest plan within budget. Otherwise it shows the lowest-cost plan with a message.
  - Fresh food is costed in whole packs; cupboard items pro rata. "Already have" ticks; a starter cupboard cost; 3 swaps per recipe; seeded shuffle.
- **Pages:** `/account/meal-plans` (members who own `meal-plans`, or admins).
  - Form (GET), plan, week grid, shopping list, recipe cards (a soft placeholder until photos come), notes (estimates and source, maintain weight, allergens, babies and toddlers).
  - "Download PDF" uses print, with a branded cover page. "Remember my choices" saves via POST with CSRF.
  - Public page `/programmes/meal-plans` has a price placeholder and no movement "flagship" card (`food: true`).
- **Waiting on the owner:**
  - allow the 6 photo hosts plus ons.gov.uk (and BLS / Statistics Canada if wanted) in the environment's network settings;
  - Pexels or Unsplash keys (stored as secrets);
  - a price for the product;
  - checking the recipes and allergens.
- **Not built yet:** the calorie calculator (optional, worked out on the phone); live price data; photos.

**Meal plans: leftovers safety and savings (2026-10-25, owner CH)**
- **Leftovers:** batch-cooked portions eaten more than 2 days after cooking (1 day for rice dishes) are marked "frozen on [day]: defrost in the fridge the night before". Every plan has a "Leftovers, safely" section citing Food Standards Agency guidance. A test checks every slot.
- **Savings:**
  - optional "what you usually spend" (remembered) shows "you could save about £X this week (around £Y a year)";
  - "Done your shop? What did you actually pay?" saves to `meal_plan_spend` (**migration 0013**);
  - members see their running total against their usual shop;
  - their real prices tune future estimates (a personal factor from the last 4 weeks, 0.7 to 1.5);
  - Admin → Stats shows the anonymous average weekly saving from **actual** spend only, with marketing guidance.
- **Privacy:** allergy ticks are never saved (they count as health data), and the planner page says so. The privacy policy has a new meal-plans bullet. Spending is included in data export and deleted with the account.

**Guarantee: movement only (owner, 2026-10-25):** "No 90 day on meal plan." The 90-day guarantee covers movement programmes only, not Budget Meal Plans.
- The trust strip on the meal-plans page drops the guarantee.
- The refund policy, terms and FAQ say so.
- The checkout tick no longer mentions the guarantee (consent version 2026-10-25). A small note under the ticks shows only when the basket has a movement programme.

**Kitchen sub-brand (discussed, not built):**
- "Body Regeneration Kitchen" at kitchen.<domain>, with the same look, its own landing page and campaign, and the shared checkout.
- To avoid looking scammy: say "part of The Body Regeneration Method"; product name "Body Regeneration Kitchen: Budget Meal Plans"; Stripe statement descriptor e.g. BODYREGEN; matching receipt.
- Ads must say "up-to-date official UK prices (updated monthly)", never "live".
- Waiting for the owner's CH to build the landing page.

**Batch built 2026-10-26 (owner CH), all on staging:**
- **Official food prices:**
  - Sources and conversions: `content/meal-plans/official-sources.json`. Fetcher: `scripts/fetch-official-prices.mjs` (run with `NODE_USE_ENV_PROXY=1` in the sandbox) writes the bundled `content/meal-plans/official-prices.json`.
  - The website refreshes by itself about monthly (daily job step `meal-prices`, stored in settings `meal.official_prices`); Admin → Stats has a "Refresh now" button.
  - **UK:** ONS RPI average prices stopped at Jan 2025, so 23 items are brought up to date with CPI food index D7C8 (currently to Sep 2026); other UK estimates are scaled by the same index.
  - **Canada:** Statistics Canada 18-10-0245-01 via the WDS vectors API, national plus provinces, 48 items.
  - **US:** BLS average prices, national plus 4 regions, 14 items. The BLS daily limit was hit from the sandbox's shared IP; a free `BLS_API_KEY` (Cloudflare secret) fixes it. Until then, US plans use estimates.
  - A region picker covers US regions and Canadian provinces. Every plan states how many items use official prices, the source and the month.
- **Reviews (migration 0014):**
  - `/account/review` (rating, text, display name, publish permission) and a review-request email about 3 weeks after joining (once, daily job).
  - Admin → Reviews: publish or reject, with guidance that genuine negative reviews must be published. Published reviews show with stars on the home page (general) and programme pages (per product).
  - Privacy updated; reviews are in export and deletion.
- **Partners (migration 0015):**
  - A per-affiliate custom rate and note (Admin → Affiliates → Partner terms).
  - 12 months of repeat-purchase commission via `referred_customers`.
  - Refunds and chargebacks after payout go into `commission_clawbacks` and are deducted from the next payout. The webhook now handles `charge.dispute.created`, so **add that event in Stripe** (STRIPE_SETUP lists 5 events).
  - Affiliate terms updated (version 2026-10-26).
- **Kitchen landing page:** `/kitchen` ("Body Regeneration Kitchen · part of The Body Regeneration Method"), with a sample £30 week, how it works, FAQs, no guarantee, and "Coming soon" until priced. In the sitemap. kitchen.<domain> to point here at go-live.
- **Calorie calculator:** an optional widget on the meal planner (Mifflin-St Jeor, adults only), worked out in the browser (`reader.js`) and never saved.
- **Still waiting:** a `PEXELS_API_KEY` environment secret for the photos (new session needed after adding it); optionally a `BLS_API_KEY`.

**Growth engine handoff (2026-10-26)**
- The owner pasted a handoff from their Growth Engine chat, then replied (voice): "Clear heart all of it. Build it all. I'm too busy. I'll check it all later… have a summary."
- Name: **Body Regeneration Kitchen** (not "Body Regen Kitchen").
- EU block: "I wouldn't even worry about the EU block for now." Not built.
- Pricing: "sort pricing out later". The Kitchen structure (£9.99 to join + about £2.99 a month) is "good for now" and is built as settings with no prices entered. Lower Body + Kitchen: "sort out later".
- Free week: show the meals, but **not** the ingredients or shopping list; maybe "the first three parts of the cooking list… something that looks good when I market it". Built as the first 3 method steps.
- Taster: "a couple" of exercises; built as 3 (one a day).
- Partner codes: "yes. Or it'll be commission." Both are supported: an organisation-paid code, optionally linked to a commission partner.
- UK prices: the owner said "live tracked prices" was nonsense and wanted real UK averages. Built from ONS shop price quotes (see below).
- **Flagged to the owner:** they mentioned marketing the free week "as AI". The planner is rule-based, not AI, so calling it AI could be misleading under UK consumer law (CMA/ASA). Suggested "smart planner" wording instead. Awaiting the owner's view.

- **Follow-up (2026-10-26):** the owner will **never advertise the planner as AI**. Ideas, not yet CH'd: a price of **19.99 (currency to confirm; the site currently charges in £)**; a refer-a-friend scheme; influencers offering about 50% off. On "latest trends / market" price labels, Claude advised against "market" or anything that suggests real-time prices, and suggested "Based on official UK shop prices, updated monthly".

- **Currency and referral funnel (owner, 2026-10-26, not yet CH'd):** charge in **£ to start**, with access for customers in the EU, US and Canada. Refer a friend: the friend gets a discount on buying; once 1 (or maybe 2) referred friends have bought, the referrer gets **a full year's access free**. Claude's proposal: the reward is 12 months of the Kitchen, members get the free year while influencers and partners get commission, and the reward is taken back if the friend refunds. Flagged: selling to EU consumers means EU VAT from the first sale (non-Union OSS), so the EU block question comes back before launch.

- **Referral tiers idea (owner, 2026-10-26, not yet CH'd):** 1 friend gives "X", 2 friends give **lifetime** (Kitchen). Confirmed again: **no 90-day refund on the meal plans** (already so). Claude's suggestion: 1 friend = 1 year of the Kitchen, 2 friends = lifetime of the Kitchen ("for as long as the Kitchen runs", in the terms).

- **Referral rethink (owner, 2026-10-26, not yet CH'd):** keep the Kitchen out of it. The reward should be for **programme buyers** once 1 or 2 friends buy with their code. The owner asked about 50% off for friends. Claude pointed out that programmes are already lifetime access, so the reward needs to be something else (money back / "get it free", other programmes, or commission). Claude suggested 20-25% for friends, keeping 50% for short, time-limited influencer offers.

- **Kitchen refer-a-friend: DECIDED (owner, 2026-10-26), build awaiting CH:** **Kitchen only** (programmes untouched; Lower Body stays one fee, lifetime). A Kitchen member shares their code. When **1 friend or family member joins the Kitchen**, the member gets **a year free**; with **2 friends**, **lifetime free**. Claude suggested the friend gets 50% off the joining fee (the monthly price stays the same), and "lifetime" in the terms means "for as long as the Kitchen runs". Friend discount awaiting the owner.

- **Kitchen joining fee idea (owner, 2026-10-26, awaiting CH):** the normal joining fee is **19.99** (the owner says they've already sold a few at 19.99), and a friend's code gives **50% off: 9.99**. Shared as "join for £9.99 with my code (normally £19.99)". Claude advised: keep records of the full-price sales, only say "normally £19.99" while people really pay that without a code, and avoid a general "was/now" sale. The currency to confirm is £ (the owner said "$", but earlier said pounds to start).

- **Stripe payouts (owner, 2026-10-26):** paid into the owner's **Monzo** for now. Claude noted that Monzo's personal accounts aren't meant for business income; the free Monzo Business account (sole trader) is the tidy option later. The Stripe set-up chose online payments, subscriptions and invoices, no Stripe Tax, the Dashboard set-up and an education/online-courses category.

- **Stripe 2FA (owner, 2026-10-26):** the owner's Stripe two-step login is years old. They need to remove it, set it up again and save the new backup codes (on OWNER_TODO).

- **Registrations later (owner, 2026-10-26):** HMRC self-employment, ICO, trademark and insurance come later. Claude flagged that the ICO fee is due once the site processes customer data (launch); HMRC has until 5 Oct after the tax year.

- **Kitchen domain (owner, 2026-10-26):** the owner asked "why buy if don't need to". No separate Kitchen domain for now: use `bodyregenerationmethod.com/kitchen` (plus the free `kitchen.` subdomain). bodyregenkitchen.com is optional later. Stripe: as a sole trader (Individual), with a personal bank account and no company needed; register as self-employed with HMRC.

- **Domain (owner, 2026-10-26): `bodyregenerationmethod.com` bought on Cloudflare** (zone active). The owner asked for it to be set up for the Kitchen too. Code: `www` → the main address and `kitchen.` → `/kitchen` (301), see `src/index.tsx`. The production env isn't created yet: that waits for the owner's "GO LIVE" (GO_LIVE.md updated with the domains, vars and secrets).

- **Recipe photos built (owner CH "a, ch", 2026-10-26):** the Cloudflare route. `PIXABAY_API_KEY` is a Worker secret on staging (the owner added it). Migration 0020 `recipe_photos`. Admin → **Recipe photos**: auto-pick 12 at a time, or tap a recipe to see 12 Pixabay options and choose or remove one. Previews are proxied through admin, so the CSP stays strict; only `pixabay.com` / `cdn.pixabay.com` images are ever fetched. Images are copied to R2 MEDIA `recipe-photos/<id>.jpg`, served publicly at `/recipe-photos/<id>.jpg?v=N`, with the licence ("Pixabay Content License") recorded and no visible credit. Recipes with no match are skipped (`automation_sent` kind `photo-no-match`) for choosing by hand. Photos show on recipe cards in the planner (and the PDF) and in the free week. **The owner has no test-site admin login yet**, so the 6am daily job auto-picks all missing photos (paced 1.5s apart for Pixabay's 100-a-minute limit). Claude reviews them from R2 the next evening.

- **Photos (owner, 2026-10-26):** Pexels has paused new API keys, so we're using **Pixabay for now** until Pexels is back online (owner: keep a reminder). Needed: a `PIXABAY_API_KEY` environment secret, plus `pixabay.com` and `cdn.pixabay.com` on the network allow-list, then a new session. Photos are downloaded and self-hosted, with the licence recorded per photo and no visible credit. Unsplash is the backup (needs an application and a credit). A reminder to check Pexels is set for the 9 Nov drop.

- **Socials (owner, 2026-10-26):** the owner referred to the brands as **"Body Regen Kitchen" and "Body Regen Method"** for socials, and asked for the best platforms and a plan for each. Written in `docs/marketing/social-plan.md`: Kitchen = TikTok, Facebook groups, Instagram, then Pinterest; Method = Instagram, YouTube, Facebook, then TikTok. Suggested handles `@bodyregenkitchen` / `@bodyregenmethod` (availability not checked). The website names are unchanged unless the owner says. The owner wants **no daytime updates: deliver in the 7pm drop**.

- **Growth batch (2026-10-26, owner: "Clear heart all of it. Build it all"):** migrations 0016-0019, all on staging (version 9292dbf0).
  - **Growth engine reporting** (`src/services/growth-engine.ts`, `src/middleware/ge.ts`):
    - `?ge=CODE` is carried through the visit without a cookie: an HTMLRewriter adds it to the site's own links and POST forms, and to redirects after a form post. It's lost if the visitor leaves and comes back later (the owner's choice: no tracking cookies).
    - `ge` is saved on orders (`orders.ge_ref`) and sign-ups (`subscribers.ge_ref`), and goes into Stripe session and payment metadata with the share code.
    - Events (lead = sign-up asked for, signup = email confirmed, purchase, refund) are saved in `engine_events` first, then POSTed with `Authorization: Bearer GROWTH_ENGINE_KEY` to `GROWTH_ENGINE_URL` (a staging var). The daily job retries failures, giving up after 10 tries. No names or emails. `external_id` is the order id, `refund-<order>`, or `signup-sub-N` / `lead-kfw-N` / `signup-code-N`. Nothing is sent until the owner adds the `GROWTH_ENGINE_KEY` secret.
    - `/marketing-feed.json`: public pages to market (programmes, Kitchen, taster, free week, guides).
  - **Method taster** (`/taster`, `src/content/taster.ts`, `src/services/sequences.ts`): double opt-in, then 3 emails (short foot, toe yoga, single-leg balance, worded from the programme) 20+ hours apart via the daily job. Day 3 links to Lower Body. It stops if they unsubscribe. The sign-up says news follows afterwards (marketing consent).
  - **Kitchen free week** (`/kitchen/free-week`, `/kitchen/week?token=`, `kitchen_trials`): email only, no card, one per email. It shows the 7 days of meals, the week's total and the **first 3 method steps** of each recipe (owner: no ingredients or shopping list). The emailed link confirms the address (and any news opt-in). Exactly one follow-up, "Want next week's plan?", goes 7 days later to confirmed addresses only. Allergies are never saved: the chosen recipe ids are stored instead.
  - **Kitchen membership** (`/kitchen/join`, `subscriptions`, `src/services/subscriptions.ts`, `/account/membership`):
    - If the Kitchen product has a monthly price (Admin → Programmes → Budget Meal Plans → Monthly membership), it's sold as a Stripe subscription: the normal price is the joining fee, charged with the first month. It's never sold through the basket.
    - Each `invoice.paid` (subscription_cycle) becomes its own paid order, so commission (12-month partner repeat), refunds and reports work. Renewals carry no share code, so the 12-month limit applies.
    - `customer.subscription.updated/deleted` keeps the status; when it ends, access is removed. A full refund of the first payment cancels the subscription in Stripe.
    - Members cancel in two clicks (`cancel_at_period_end`) and get a confirmation email; they can undo it. The terms have a membership section, including a **30-day notice of price changes (Claude's suggested default; owner to confirm)**.
    - Also built: **favourite recipes** (starred recipes are preferred where the budget allows) and a **fresh plan every week** (the seed changes each Monday).
  - **Access codes** (`/redeem`, Admin → Access codes, `access_codes` + `access_code_claims`):
    - Partner codes (an organisation pays monthly, invoiced from Stripe by hand; the fee is a note) and beta codes (free).
    - Using a code needs email confirmation. It's a £0 order with `orders.access_code`, plus consents (health declaration and terms), and an account-setup link. There's a maximum number of uses, the same person isn't counted twice, and pausing stops new people. Ending a code (with a confirm tick) removes the access it gave.
    - A code can link to an affiliate share code, so the partner earns commission on later purchases (`referred_customers`).
    - Results per code: joined, active in the last 30 days, and later sales.
    - **Beta testers' published reviews say "Given free access as a beta tester"** (the law on incentivised reviews).
  - **UK prices from real shop data:** the ONS price-quotes files stopped including supermarket food after **January 2026** (ONS moved to supermarket till data, which isn't published by item). `scripts/build-ons-quotes.mjs` takes the Jan 2026 file and produces `content/meal-plans/ons-price-quotes.json`: median shop prices for 61 mapped foods, national plus 12 UK regions (at least 8 quotes each). These are brought up to the latest month with CPI food index D7C8 (food prices were flat in 2026: 143.3 → 143.4). UK regions now appear in the planner's region picker. The mapping and pack factors are in `official-sources.json` → `uk.quotes`. The old RPI series list remains in the JSON but isn't used.
  - **Not built (owner: later or skip):** the EU checkout block (owner: don't worry for now), final prices, and a Lower Body + Kitchen bundle.

## Next step
- **Planned: go live Monday 2026-10-26**, as a sole trader with Stripe paying into the owner's personal bank account. Switch to the owner's Ltd later (the legal pages need about 15 minutes of updates then).
  - Needed from the owner: domain, Stripe, prices, legal details (name "trading as", postal address, contact email), Resend and the ICO fee.
  - Preview accounts on staging: `michaeljmarden+preview@gmail.com` (owner, set up) and `michaeljmarden+brother@gmail.com` (setup link sent 2026-10-25, unused at the time).
- **2026-10-24: the course is published on staging only**, at the owner's request, so they can preview it on their phone. Their preview member account is `michaeljmarden+preview@gmail.com` (order `OWNER-PREVIEW`, £0, no payment). Their main account is the admin one, which needs 2FA. The content files still say `status: draft`, so a later `--update` import will set staging back to draft unless the files are changed to `published` first.
- The owner reviews the course (screenshots, or drafts once admin login exists) and the YouTube links.
- Publish the drafts on staging once the owner approves. In admin, or set `status: published` in the files and run `node scripts/import-content.mjs staging --update`.
- Then **Step 9 (go live):** see `docs/GO_LIVE.md`.
