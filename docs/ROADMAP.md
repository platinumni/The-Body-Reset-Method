# Roadmap

Times are realistic / worst case, including waiting for the owner's "CH".

| # | Step | Status | Time |
|---|---|---|---|
| 0 | Decisions: name, payments, structure | ✅ Done 2026-10-23 | — |
| 1 | Foundation: test site, security, checks, deploy and backups, docs | ✅ Done 2026-10-23 | — |
| 2 | Look and public pages | ✅ Done 2026-10-23 | — |
| 3 | Shop: packages, bundles, basket and add-ons, Stripe checkout, receipts | ✅ Done 2026-10-23 (live test awaits Stripe keys) | — |
| 4 | Members area: account from email link, My Programmes, Full Programme and Quick Run-Through tabs | ✅ Done 2026-10-23 | — |
| 5 | Admin: two-step login, programme editor, orders, customers, refunds, logs, backups, stats | ⏳ Next | 4 / 9 days |
| 6 | Affiliates: share links, tracking, commission, payouts | — | 3 / 6 days |
| 7 | Automation: email sequences, morning report, usage watch, approvals | — | 2 / 5 days |
| 8 | Content: owner's programmes loaded (via voice notes → drafts → approval) | — | Depends on owner |
| 9 | Go live: domain, Stripe live, real test purchase and refund, and a check that no `[PLACEHOLDER]` remains | — | 1 / 3 days |

## Step details
**Step 2: Look and public pages**
- Design system and brand, and a homepage that hints at the philosophy (tension, forcing, control, release) without giving it away.
- Programme pages, a "who it's for / not for" section and the coach's story.
- FAQs with structured data.
- Privacy, terms, cookies, health disclaimer and refund pages.

**Step 3: Shop**
- Programme catalogue, packages and bundles.
- A basket with add-on suggestions.
- Stripe Checkout, server-verified via webhook.
- Order records.
- Health declaration and the "start now, waive 14-day cancellation" tick boxes.
- Receipt and "create your account" emails (Resend).

**Step 4: Members**
- Account creation from the emailed link, login, password reset and account page.
- My Programmes, showing only the programmes bought.
- A reader with the Full Programme and Quick Run-Through tabs, YouTube embeds (privacy mode) and progress ticks.
- Data export, account deletion and email preferences.

**Step 5: Admin**
- Two-step login (authenticator app plus backup codes).
- Programme editor: sections, lessons, text, YouTube links, images (R2), key points, and draft, preview, publish and archive.
- Prices and bundles.
- Orders, refunds and removing access.
- Customers: search, CSV export and deletion.
- Activity log, backups page and stats (anonymous).

**Step 6: Affiliates**
- Every customer gets a share link. Visits are tracked with a first-party cookie set only on affiliate links (disclosed).
- Commission on sales, held until the refund window passes.
- An affiliate dashboard.
- Payouts: a monthly owner-approved list (bank transfer or PayPal), with possible Stripe Connect automation later.
- Affiliate terms with the duty to label posts as ads.

**Step 7: Automation**
- Welcome and "how to start" emails, check-in emails, and affiliate earnings emails.
- A daily morning report and a usage watch (80% alerts).
- Anything automatic goes through approvals.
