# CLAUDE.md — rules for any Claude session working on this repo

Read `docs/HANDOVER.md` first. It says where the project is up to and what's next.

## The owner
- A non-developer business owner, usually on their phone. Use plain English and give short, honest answers with realistic and worst-case times. Don't nag.
- Workflow: send a short brief → the owner replies **"CH"** (cleared hot) → work quietly → short report + git bundle.
- **Nothing goes live and no live database changes without the owner's clear go-ahead.** Always use the test site (staging) first.
- **Never invent** prices, reviews, testimonials, statistics, credentials or results. Use clearly marked placeholders: `[PLACEHOLDER: …]`.
- Health wording: this is **education and movement coaching, not medical treatment**. No claims to cure, heal, treat or fix conditions or pain. Flag any borderline wording for the owner.
- After each step, update `docs/HANDOVER.md`, `docs/ROADMAP.md` and `docs/OWNER_TODO.md`.
- **Backups (owner's standing request, 2026-10-25):** whenever anything changes, or a decision is made in chat:
  1. write the decision into `docs/HANDOVER.md` ("Decisions made in chat"); voice notes go in `docs/owner-notes/`;
  2. commit and push;
  3. make a bundle (`bash scripts/make-bundle.sh <scratchpad>`);
  4. send the owner the **latest two** bundles. Send nothing else unless asked.

## Engineering rules (non-negotiable)
- `npm run check` (type check + migration check + all tests) must pass before every commit.
- **Database changes are add-only.** Add a new numbered file in `migrations/`, then run `npm run migrations:lock`. Never edit or delete an old migration. No DROP, DELETE, RENAME or REPLACE in migrations (the check enforces this).
- Structure:
  - `src/views/` covers how pages look (JSX). Views never touch the database.
  - `src/routes/` covers what happens at each address: reading input and calling services.
  - `src/services/` holds the business rules and **all** database access.
  - `src/lib/` holds pure helpers. `src/middleware/` holds cross-cutting request handling.
- Security:
  - PBKDF2 password hashes.
  - Session tokens stored only as SHA-256 hashes.
  - `<CsrfField>` on every POST form.
  - Rate limits on login and other sensitive posts.
  - Security headers and a strict CSP (no inline scripts).
  - Two-step login for admin.
  - Audit log of admin actions.
- Secrets live only in Cloudflare (`wrangler secret put`), never in code, docs or chat.
- UK GDPR: consents are recorded in `consents` (append-only). Provide data export and deletion. Marketing is opt-in with one-click unsubscribe. No tracking cookies.
- SEO: every page has a title, description and canonical. Never change a public URL without a 301 redirect. Staging is always noindex.
- Mobile first and accessible (labels, focus styles, contrast, reduced motion).
- Deploy only with `npm run deploy:staging` or `npm run deploy:production`. These run checks, back up, migrate, deploy, then a health check.
- Never touch the owner's other Cloudflare projects (`platinumni*`, `ironworks-*`, `keystone-*`). Everything here is named `bodyregen-*`.
