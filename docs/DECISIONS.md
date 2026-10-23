# Decisions log

Newest first. Each entry has the decision, why, and how to undo it.

## 2026-10-23: Payments via PayPal direct
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
