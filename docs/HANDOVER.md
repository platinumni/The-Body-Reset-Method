# Handover — The Body Regeneration Method

_Last updated: 2026-10-23, after Step 2 (Look and public pages)._

## What this is
This is a worldwide (mainly UK) website selling online movement programmes by the owner, a coach.
- **Flagship:** Lower Body Regeneration. It works from the ground up: feet, arches and toes → Achilles and calves → knees → hip stability.
- **Philosophy:** release the tension, the forcing and the control, and learn to love your body again. The homepage hints at it; buyers get the full teaching.
- **Buying:** visitors buy without an account. Afterwards they get an emailed link to create an account, and they see only the programmes they've bought.
- **Each programme has two tabs:**
  - **Full Programme:** read it first, a few times.
  - **Quick Run-Through:** key points.
- **Content:** text, YouTube video links and the owner's images.
- **Affiliates:** customers can share a personal link and earn commission. One level only.
- **Payments:** PayPal. See `docs/DECISIONS.md`.

## Where things are
| What | Where |
|---|---|
| Code | GitHub `platinumni/The-Body-Reset-Method`, working branch `claude/clever-dirac-1c0vll` |
| Test site | https://bodyregen-staging.michaeljmarden.workers.dev |
| Live site | Not created yet (Step 9, after the domain is bought) |
| Cloudflare account | Owner's account `0db80beb5c1fff6eaf82105bdd1c543d` (shared with Platinum NI; don't touch `platinumni*`) |
| Test database | D1 `bodyregen-staging` |
| Test backups | R2 `bodyregen-backups-staging` |

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

## Next step
**Step 3: Shop** (see `docs/ROADMAP.md`). This needs the owner's PayPal Business account (sandbox keys for testing).
