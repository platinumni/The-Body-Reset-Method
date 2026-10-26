# Owner to-do list

These are things only you can do. None of them block the build until go-live unless marked.

## Soon
- [ ] *(Optional)* **Test-site admin login.** The owner chose to wait until the live site, which gets its own admin login at go-live. Claude shows drafts as screenshots or preview links until then.
- [ ] **Review the full course** (screenshots sent 2026-10-24). Reply with changes by voice note. In particular, check:
  - the exercises Claude wrote for you: tibialis raises, glute bridge, clamshells, all of Hips and Core, and the "Strengthen and reintegrate" list;
  - the toe yoga swap (four toes down, big toe up), which Claude added from your note;
  - every "What to watch for" list (Claude researched these).
- [ ] **Watch every YouTube demo link** and tell Claude any to swap. None has been watched by a person yet.
- [ ] **Prices:** Lower Body (you mentioned 29.99; **£ or $?**) and Core & Hips, Hips, and Core (each has its own buy page now).
- [ ] **Photos:** your own phone photos of each starting position are best. AI images often get feet and toes wrong.
- [x] **Domain bought:** bodyregenerationmethod.com (2026-10-26). The Kitchen will be kitchen.bodyregenerationmethod.com.
- [ ] **Stripe account** (free) at stripe.com. You only need test mode for now. Steps are in `docs/STRIPE_SETUP.md`. Turn on PayPal under Settings → Payment methods if you want customers to have it as an option.
- [ ] **Affiliate commission %.** For example 20% or 30% of the sale. Set it yourself in **Admin → Affiliates** (the programme stays closed until you do). Also check the minimum payout (£10). Commission is held 90 days and paid on the last working day of the month; **payouts stay manual** (owner, 2026-10-24): you pay by PayPal or bank and tap "Record payout".
- [ ] **Your coach story and photos.** A short bio, your own journey (in your words), and any photos or images.
- [ ] **Check the test site wording** and reply with changes. Every yellow highlight is a placeholder waiting for your words.
- [x] **Access length:** lifetime (owner, 2026-10-24). It's on the programme pages, FAQ and terms. Worth a line in the solicitor review.

- [ ] **Keep evidence for "thousands"** (group sizes, messages, screenshots) in case it's ever challenged.
- [ ] **Testimonials:** collect real quotes from people you've helped, with their permission (first name and town is fine), and no medical-cure claims.

- [ ] **Read the 3 new guides** (`/guides` on the test site) and tell Claude any changes. They're in your voice, built from your philosophy.
- [ ] **Decide on a sign-up offer** (optional), e.g. 10% off the first programme. Create the code in Stripe, then add the headline and code in Admin → Site wording.
- [ ] **Testimonials:** paste real ones into Admin → Site wording (or send them to Claude) and the section appears automatically.

- [ ] **When the course content is final:** choose an AI voice from samples Claude sends (a one-off cost of about £2–£20).

- [x] Network addresses for meal plans added (2026-10-25). Still to do: check the recipes and allergens.

- [x] **Pixabay key added in Cloudflare (2026-10-26).** Photos are auto-picked by the 6am job on 27 Oct; Claude checks them. You can swap any in Admin → Recipe photos once you have a test-site admin login.
- [ ] ~~Photos via environment settings~~ (not needed now): sign up at pixabay.com, copy your key from pixabay.com/api/docs, and add it to the environment "Default" as `PIXABAY_API_KEY` (Network secrets or an environment variable). Add `pixabay.com` and `cdn.pixabay.com` to the allowed network addresses. Never paste it in chat. Then start a new chat: "do the recipe photos with Pixabay".
- [ ] **Reminder:** check whether Pexels API keys are available again (pexels.com/api). Claude will remind you in the 9 Nov drop.
- [ ] *(Optional)* **US prices:** a free BLS key (data.bls.gov/registrationEngine) stored as a Cloudflare secret `BLS_API_KEY`, so US plans use official prices.
- [ ] **Network:** once the photos are done, remove this project's 16 addresses from the allow-list (listed in HANDOVER).

## New from the growth batch (2026-10-26). Check when you have time
- [ ] **Have a look on the test site:** `/taster`, `/kitchen/free-week`, `/kitchen` and `/redeem`. In admin: **Access codes**, and Programmes → Budget Meal Plans → **Monthly membership**.
- [x] **"AI" wording:** decided (2026-10-26): never advertised as AI.
- [ ] **Growth engine key:** in Cloudflare → Workers → `bodyregen-staging` → Settings → Variables and secrets, add a **Secret** called `GROWTH_ENGINE_KEY` with the reporting key from your growth engine. Never paste it in chat. Events are saved and sent once it's there.
- [ ] **Kitchen prices:** the joining fee is the normal "Price" box, and the monthly price is the new box below it. Set them when you're ready (e.g. 9.99 and 2.99), then put the product on sale.
- [ ] **Stripe:** when you set up the webhook, also tick `invoice.paid`, `customer.subscription.updated` and `customer.subscription.deleted` (now 8 events; `docs/STRIPE_SETUP.md`). In Stripe → Settings → Emails, turn on receipts and failed-payment emails for memberships.
- [ ] **Check the new terms wording:** the membership section promises 30 days' notice of any price change. Claude suggested that as a fair default; change it if you want.
- [ ] **Taster emails:** read the 3 days in `src/content/taster.ts` (or ask Claude for screenshots). They use the programme's own wording.
- [ ] **Partner codes:** for each club or gym, create a code in Admin → Access codes, invoice them monthly from Stripe, and share `…/redeem?code=THEIRCODE`. **Beta testers:** create one "Beta" code for your 10-20 testers.

## Before go-live
- [x] **Done 2026-10-26:** Stripe account activated, 2FA reset with backup codes saved, sandbox test passed. ~~Stripe two-step login:** your Stripe 2FA is from years ago. Remove the old one and set it up again on your current phone (Stripe → Profile/Settings → Security), then **save the new backup (recovery) codes** somewhere safe offline. Do this before activating live payments.
- [ ] Follow `docs/GO_LIVE.md`. Admin → **Launch checklist** shows what's left.
- [ ] **ICO data protection fee** (about £52 a year): ico.org.uk/fee
- [ ] **Trademark check** on "The Body Regeneration Method" (UK IPO search, free): gov.uk/search-for-trademark
- [ ] **Insurance:** professional indemnity / public liability that covers online coaching.
- [ ] **Stripe: activate live payments** (business details and bank account) before go-live.
- [ ] **Business setup (owner may use their existing Ltd, 2026-10-24):** if so, sell as "[Ltd name] trading as The Body Regeneration Method". Then:
  - no self-employed registration is needed;
  - Stripe and its payouts go to the company and the company bank account;
  - the legal pages show the company name, number and registered office (send Claude these);
  - VAT counts the company's total turnover across both websites (£90k threshold);
  - one ICO fee covers the company, but check the registration mentions this website;
  - insurance should cover both activities;
  - ask the accountant whether to add a SIC code for online coaching.
  If not using the Ltd: register as self-employed with HMRC by 5 October after the tax year you start selling.
- [ ] **Accountant question:** EU VAT on digital sales to EU customers (it applies from the first EU sale). Ask whether to register for the "non-Union OSS" or limit EU sales. UK VAT only kicks in over £90k turnover.
- [ ] **Email sending:** a Resend account (or reuse the Platinum NI one) and verify the new domain.
- [ ] **Solicitor review** of the terms, refund and health disclaimer pages (recommended, not required).
- [x] **Refund policy:** 90-day money-back guarantee on every programme (2026-10-24).
- [ ] **Contact email (parked, 2026-10-24):** when you've made the Gmail for website messages, put it in Admin → Site wording → "Contact form: send messages to" (or send it to Claude). Until then, messages wait in Admin → Messages.
