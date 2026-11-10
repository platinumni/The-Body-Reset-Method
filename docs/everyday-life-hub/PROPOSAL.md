# Everyday Life Hub: proposal, architecture and phased plan

Written 2026-11-10 after inspecting this repository (The Body Regeneration Method) and its environment. **Proposal only: nothing built. Waiting for the owner's decisions and CH.**

## 1. What I found (and why it matters)
This repo already contains about 70% of the hard, boring foundations the Hub needs. They're tested (347 tests) and running on Cloudflare:

| Already built here | Reuse in the Hub |
|---|---|
| Hono + server-rendered JSX on Cloudflare Workers, D1, R2, crons; add-only migrations; safe deploy script with backups | The same stack. Cheap at scale (about £10-£50 a month at 50,000 users, no marketing email) |
| Accounts: PBKDF2 passwords, SHA-256 session tokens, CSRF, rate limits, strict CSP, admin 2-step login, audit log | Copy as is |
| UK GDPR: consents log, data export, account deletion, privacy wording | Copy and extend |
| Budget meal planner (153 recipes, official ONS prices, shopping lists, savings tracker) | **Feel Better / Save Time / Save Money** |
| Movement programmes (guide, listen, key points, printable sheets, progress) | **Feel Better** |
| Team wellbeing: daily session, streaks, charts, mood check-in, week planner, encrypted diary, daily thought | **Home, Reduce Stress, Save Time** |
| Access codes (organisation-paid, max places, take-up), partners, affiliates, refer-a-friend, Stripe subscriptions | **Partner distribution** |
| Installable web app manifest | Becomes a full PWA (service worker, offline, updates) |

**Recommendation: a new, separate product (own repo, own brand, own Cloudflare resources named `lifehub-*`), built by copying these proven parts.** Body Regen stays as it is, and could later become a content partner inside the Hub (its courses and Kitchen feed "Feel Better").

## 2. Challenges to the brief (honest pushback)
1. **Three overlapping business products.** Body Regen "team wellbeing", Platinum Life and the Hub are now three versions of the same idea. **Pick one B2B home.** I recommend the Hub. Pause Platinum Life's meal-planner rebuild and Body Regen stage 4 until you decide.
2. **"Savings comparison tools"** need live tariff and price data. That means paid feeds, or scraping (which breaks sites' terms). Instead:
   - honest calculators using official public data (e.g. the Ofgem price cap);
   - checklists of savings people genuinely qualify for (social tariffs, council tax discounts);
   - links out to official tools (MoneyHelper, Turn2us, entitledto).

   Affiliate comparison offers can come later, clearly labelled.
3. **Money is guidance, not advice.** Personal financial advice is FCA-regulated. The tools calculate the user's own numbers and point to MoneyHelper, with no recommendations of products. Health stays "education, not treatment". Journaling and stress tools carry crisis signposting (Samaritans 116 123, NHS 111).
4. **Reminders on iPhone:** web push only works when the app is installed to the home screen (iOS 16.4+). Reminders are "where supported", with in-app nudges as the fallback. We shouldn't promise more.
5. **Partner dashboards can de-anonymise small teams.** A 6-person business seeing "1 person logged a low mood" identifies someone. Rule: partners see **counts only, no health, mood, money or journal data at all**, and nothing for any group under 10 people.
6. **Content is the real bottleneck, not code.** Every area needs checked content (programmes, roadmaps, guides). I can draft; the owner approves. Budget time for that.
7. **Not an MVP of everything at once, and not a thin demo either:** one coherent foundation (accounts, design system, PWA, home, partners model), then each area shipped **complete**, one at a time, in the order that delivers value soonest.

## 3. Product structure
- **Onboarding (about 60 seconds):** pick the areas that matter now (any of the 5), one or two quick questions each (e.g. household size, weekly food budget, "how's your sleep?"), optional name. Everything is skippable. Then install guidance on mobile.
- **Home:** "Today". Up to three personalised next steps from the areas they chose, their streaks and goals, and the latest real results (e.g. "£12.40 under your food budget last week", calculated from their own entries only).
- **Navigation:**
  - mobile: a bottom tab bar with Home · Money · Health · Time · Mind · Grow (6 tabs, with clear icons and labels);
  - desktop: a side rail.
- **The five areas**, each with 3-5 complete tools:

| Area | Tools (first release) | Later |
|---|---|---|
| Save Money | Budget builder (income, bills, spending; monthly picture); bills & subscriptions tracker (renewal dates, yearly cost, "cancel or switch?" checklist); savings goals with progress; savings checklist (social tariffs, council tax discounts and so on, with official links); food budget via the meal planner | Debt payoff planner; affiliate offers (labelled) |
| Feel Better | Movement programmes (follow-along, beginner plans); meal planner + shopping list; habit tracker; sleep log; progress charts | Step import (where the device allows) |
| Save Time | Weekly life planner; reusable checklists (templates: moving house, school mornings…); routines (morning/evening); meal-prep plan from the meal planner | Shared household lists |
| Reduce Stress | Guided breathing (animated, respects reduced motion); journal (encrypted); "untangle it": break an overwhelming task into small next steps; daily reflection; mood check-in | Short audio guides |
| Earn & Grow | Skills roadmaps (e.g. digital basics, first-line management, CV and interviews); career plan and goals; curated free learning (National Careers Service, Skills Bootcamps, OpenLearn); progress | Partner-sponsored courses |

Every number shown comes from the user's own entries or a cited official source. No invented savings, results or testimonials.

## 4. Partner (B2B) model
- **One personal account per user**, for life. Partners never own users. A user keeps their progress if they leave the employer.
- **Partners:**
  - tiers: Free distribution (charities, councils), Business Starter, Business, Enterprise; prices are `[PLACEHOLDER]`;
  - places and co-branding (logo and colours on their landing page `/p/<partner>`);
  - invite links and QR codes (the `uqr` library is already here, free);
  - admins invited by email.
- **Attribution:** first-touch partner per user (and which link or campaign), kept separately from usage data.
- **Partner dashboard:**
  - registrations, active users (7/30 days), which areas are used (counts), and minimum-group-size suppression;
  - CSV export of the same totals;
  - no access to any individual's data.
- **Billing:** annual Stripe invoices or subscriptions per partner. Salesman commission per partner (from the existing affiliate system).
- **Future:** premium add-ons and affiliate offers, with an entitlement system already in place.

## 5. Architecture
- **Cloudflare Workers + Hono JSX, server-rendered,** with small no-dependency client scripts ("islands") for interactivity: breathing animation, charts, instant ticks. Fast on low-powered phones; no framework bundle.
- **PWA:**
  - manifest with icons and shortcuts;
  - service worker: cache-first for static assets and network-first for pages, **never caching private pages**;
  - an offline page, and offline drafts for the journal and checklists (saved on the phone and sent when back online);
  - "new version available" update prompt;
  - install guidance for iOS and Android.
- **D1 (SQLite)** with add-only migrations:
  - core: `users`, `sessions`, `consents`;
  - `partners`, `partner_admins`, `partner_links`, `user_attribution`;
  - per-area tables (`budget_*`, `bills`, `goals`, `habits`, `sleep_logs`, `checklists`, `routines`, `journal` (encrypted), `roadmap_progress`…);
  - `entitlements` for premium later;
  - daily `partner_stats` rollups (aggregates only).
- **Encryption at rest** for journal, money figures and health logs (AES-GCM, key in a Worker secret).
- **R2** for images and partner logos. **Crons** for reminders, rollups, backups and official-data refresh.
- **Email:** account emails only, via Resend's free tier. No marketing email unless the user opts in.
- **Design:** warm, calm, premium:
  - one serif display face plus a clean sans;
  - generous spacing and soft cards;
  - one accent colour per area, used sparingly;
  - subtle motion (respecting reduced motion) and full light and dark themes;
  - WCAG AA, 44 px touch targets, real empty and loading states.

  Not a SaaS dashboard: feels like a well-made personal app.
- **Quality:** strict TypeScript, tests per tool (calculations and privacy rules especially), staging first, deploy with a backup, Lighthouse and accessibility checks per phase.

## 6. Phased plan (realistic / worst case; plus the owner's review time)
| Phase | What | Time |
|---|---|---|
| 0 | Decisions: name and trademark check, domain, separate repo, one B2B home (section 2.1), who approves content | Owner, a few days |
| 1 | **Foundation:** new repo, accounts and security, design system, app shell and navigation, full PWA (SW, offline, updates, install guide), onboarding, personalised Home, privacy (export, delete, consents), admin basics, staging | 1.5 / 3 weeks |
| 2 | **Feel Better:** port movement programmes and the meal planner; habits; sleep; progress charts | 1.5 / 3 weeks |
| 3 | **Save Money:** budget builder, bills and subscriptions, goals, savings checklist and calculators (official data) | 1.5 / 3 weeks |
| 4 | **Save Time + Reduce Stress:** planner, checklists, routines, meal prep; breathing, journal, untangle-it, reflections | 1.5 / 3 weeks |
| 5 | **Earn & Grow:** roadmaps, career plan, curated learning, goals | 1 / 2 weeks |
| 6 | **Partners:** accounts, tiers, invite links and QR codes, co-branded pages, aggregated dashboards, attribution, Stripe annual billing, salesman commission | 2 / 4 weeks |
| 7 | **Reminders, polish and beta:** web push where supported, accessibility and performance audit, beta with real users | 1 / 2 weeks |

**Total: about 10-12 weeks of build (worst case about 5 months), plus content writing and approval.** Each phase ends on the staging site for the owner to try on their phone. Nothing goes live without "GO".

Order note: Phase 6 could move up to straight after Phase 2 if a business wants to pilot early. The foundation (Phase 1) is designed for partners from day one, so that works.

## 7. Running costs (estimates; re-check list prices)
Cloudflare Workers paid plan $5 a month, plus D1, R2 and requests: about £10-£50 a month at 50,000 users with no marketing email and videos on YouTube. Resend free tier for account emails, or about £16-£20 a month at volume. No paid AI or data services needed.

## 8. Decisions needed from the owner
1. **Separate product and repo:** yes? (I need a new GitHub repo created or allowed.)
2. **Name:** "Everyday Life Hub", subject to a UK IPO trademark search and a free domain.
3. **One B2B home:** the Hub instead of Platinum Life and Body Regen teams?
4. **Content:** OK for Claude to draft everything for the owner to approve?
5. **CH Phase 0-1** to start the foundation.
