# Decisions log

Newest first. Each entry has the decision, why, and how to undo it.

## 2026-10-24: Voiceover
- The owner listened to free open-source AI voices (Kokoro) and rejected them as not good enough.
- **Plan:** a premium AI voice (e.g. ElevenLabs) once the content is final, as a one-off cost. The device voice stays as the fallback until then.

## 2026-10-23: Payments switched to Stripe (replaces PayPal direct)
- **Decision:** Stripe Checkout, the hosted payment page. Customers pay by card, Apple Pay, Google Pay, or PayPal, which is enabled inside Stripe.
- **Why:** the owner asked. It's cheaper for UK cards (about 1.5% + 20p, against about 2.9% + 30p), quick to set up, has a full test mode, and its multi-item checkout suits the basket. Stripe Tax (optional, about 0.5% per sale) can calculate EU VAT later.
- **Affiliate payouts:** a monthly owner-approved list paid by bank transfer or PayPal. Stripe Connect automation is possible later.
- **Undo:** payment code sits in `src/services/payments/stripe.ts`, so only one module changes.

## 2026-10-23: Owner approvals
- Safety wording on the "not for" list and health disclaimer: **approved** by the owner.
- Added to "who it's for": people who have tried physiotherapy for years without lasting change.
- The owner gave a go-ahead for Steps 3–7 to run back to back on the **test site only**. Going live still needs a separate go-ahead.

## 2026-10-23: Payments via PayPal direct (superseded by Stripe, same day)
- **Decision:** PayPal Checkout. Customers can pay with PayPal or a card through PayPal, without a PayPal account.
- **Why:** the owner asked for the cheapest and easiest option. It's mainly UK, starting small. PayPal is about 2.9% plus 30p per UK sale, against about 5% plus 50p for a "merchant of record" (Paddle, Lemon Squeezy), and the owner can start straight away.
- **Trade-off:** the owner handles tax. No UK VAT until £90k turnover. EU VAT applies from the first EU sale (see the accountant question in `OWNER_TODO.md`).
- **Undo:** payment code sits behind one service (`src/services/payments/`, Step 3), so switching to a merchant of record later means changing one module.

## 2026-10-23: Affiliates, one level only
- Customers earn commission on sales from their own link. No commission on their recruits' sales, so it can never look like a pyramid scheme. Not FCA regulated.
- Tracking and commission are automatic. Payouts start as a monthly list the owner approves with one tap. PayPal Payouts automation follows once PayPal grants access.

## 2026-10-23: Wording is education, not treatment
- No claims to cure, heal or fix medical conditions or pain (ASA/CAP code, and FTC rules in the US).
- A clear "not for" list (e.g. torn tissue, active injury, people under medical or physio care for a condition) and a required health tick box at checkout.
- **No health details are stored** (only the tick, as a consent record), so we avoid special-category data.

## 2026-10-23: Name
- **The Body Regeneration Method.** The repo keeps its original name (`The-Body-Reset-Method`). Cloudflare resources are named `bodyregen-*`.

## 2026-10-23: Stack
- Same as Platinum NI: Cloudflare Workers + Hono JSX, D1, R2, cron jobs and Resend. About £5–£20 a month plus payment fees.
- Built on a workers.dev test address. The domain is attached at go-live. The code, the migrations and the deploy script make it portable to any Cloudflare account.
