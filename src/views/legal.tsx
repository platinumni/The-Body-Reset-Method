import type { Child } from "hono/jsx";
import { GUARANTEE, placeholder } from "../content/site";
import { Text } from "./components";
import { Layout, type PageMeta } from "./layout";

// Draft legal pages. Every page carries a "draft" placeholder until the owner (ideally
// with a solicitor) has reviewed it. Business details are placeholders.

const BUSINESS = placeholder("Business or trading name");
const ADDRESS = placeholder("Business postal address");
const EMAIL = placeholder("Contact email address");
const UPDATED = "23 October 2026";

export type LegalSlug = "privacy" | "terms" | "cookies" | "refunds" | "health-disclaimer" | "affiliate-terms";

export const LEGAL_PAGES: Record<LegalSlug, { title: string; description: string; body: () => Child }> = {
  privacy: {
    title: "Privacy policy",
    description: "How we collect, use and protect your personal information.",
    body: () => (
      <>
        <h2>Who we are</h2>
        <p>
          This website is run by <Text copy={BUSINESS} />, <Text copy={ADDRESS} />. We are the "controller" of your personal information. Contact us at{" "}
          <Text copy={EMAIL} />. ICO registration number: <Text copy={placeholder("ICO registration number")} />.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>When you buy:</strong> your name, email address, country and what you bought. Payment is handled by Stripe. We never see or store your
            card details.
          </li>
          <li>
            <strong>Your account:</strong> your email address, name, password (stored only in scrambled "hashed" form) and your progress through your programmes.
          </li>
          <li>
            <strong>Your choices:</strong> a record of the boxes you tick, such as agreeing to the terms or choosing to receive marketing emails.
          </li>
          <li>
            <strong>If you share your affiliate link:</strong> your referral code, the sales it brings in, the commission owed, and the payment details you give us
            for payouts.
          </li>
          <li>
            <strong>If you sign up for news:</strong> your email address, where on the site you signed up, and when you confirmed. We only add you once
            you've clicked the confirmation link we email you.
          </li>
          <li>
            <strong>If you leave a review:</strong> your rating, what you wrote and the name you chose to show. We only publish it if you tick the box
            allowing us to, and after we've checked it. You can ask us to remove it at any time.
          </li>
          <li>
            <strong>If you use the meal plans:</strong> the choices you ask us to remember (budget, household size, children's ages, foods to leave out)
            and, if you enter them, what you usually spend and what you actually paid. Allergy choices are never saved. We use spending figures to show your
            own savings and to make your price estimates more accurate. We may publish anonymous averages across all members (for example "members spend
            about £X a week less than their usual shop"), which never identify anyone.
          </li>
          <li>
            <strong>Security information:</strong> IP address and browser details, used to keep accounts secure and block abuse.
          </li>
        </ul>
        <p>
          <strong>We do not collect health information.</strong> Before buying, you tick a box to confirm you have read the health guidance. We record that
          you ticked it, nothing about your health.
        </p>
        <h2>Why we use it (our lawful basis)</h2>
        <ul>
          <li>
            <strong>To provide what you bought</strong> (contract): giving you access, your account and service emails.
          </li>
          <li>
            <strong>To meet legal duties</strong> (legal obligation): keeping sales records for tax.
          </li>
          <li>
            <strong>To keep the site safe</strong> (legitimate interests): security, fraud prevention and fixing problems.
          </li>
          <li>
            <strong>Marketing emails</strong> (consent): only if you opt in. Every email has a one-click unsubscribe.
          </li>
        </ul>
        <h2>Who we share it with</h2>
        <p>We never sell your information. We use these trusted services to run the site:</p>
        <ul>
          <li>Cloudflare: website hosting and database.</li>
          <li>Stripe: taking payments (and PayPal, if you choose to pay with it).</li>
          <li>Resend: sending emails.</li>
          <li>YouTube (Google): programme videos, embedded in privacy-enhanced mode. YouTube may set cookies once you press play.</li>
        </ul>
        <p>
          Some of these providers process data outside the UK, for example in the USA. Where they do, the transfer is protected by UK adequacy regulations
          or approved contract terms.
        </p>
        <h2>How long we keep it</h2>
        <ul>
          <li>Sales records: 6 years, as UK tax law requires.</li>
          <li>Your account: until you delete it.</li>
          <li>Marketing consent: until you unsubscribe. We keep a record that you did, so we don't email you again.</li>
          <li>Security logs: up to 12 months.</li>
        </ul>
        <h2>Your rights</h2>
        <p>
          You can ask to see, correct, download or delete your information, object to or restrict how we use it, and withdraw consent at any time. You'll be
          able to download or delete your data yourself from your account page, or you can email us. If you're unhappy with how we handle your information,
          you can complain to the Information Commissioner's Office (ico.org.uk, 0303 123 1113).
        </p>
      </>
    ),
  },
  terms: {
    title: "Terms of sale and use",
    description: "The terms that apply when you buy and use our programmes.",
    body: () => (
      <>
        <h2>About these terms</h2>
        <p>
          These terms apply when you buy from or use this website, which is run by <Text copy={BUSINESS} />, <Text copy={ADDRESS} />. Contact:{" "}
          <Text copy={EMAIL} />.
        </p>
        <h2>What you're buying</h2>
        <p>
          Our programmes are digital content: written teaching, images and video. When you buy, you get a personal, non-transferable licence to use the
          programme for your own use. Access is for life: you can return to the programmes you've bought for as long as our members' area is running, with no subscription.
        </p>
        <h2>Please don't share</h2>
        <p>
          Your account is for you only. Please don't share your login or copy, record, resell or publish the programme content. We may suspend accounts that
          do.
        </p>
        <h2>Prices and payment</h2>
        <p>
          Prices are shown at checkout in <Text copy={placeholder("Currency, e.g. GBP (£)")} />, including any taxes that apply. Payment is taken by Stripe
          when you order.
        </p>
        <h2>Your right to cancel</h2>
        <p>
          If you're a consumer in the UK or EU, you normally have 14 days to cancel a digital purchase. At checkout, you can ask for immediate access to your
          programme. If you do, and you confirm you understand, you lose that 14-day right once access begins. Our 90-day money-back guarantee still
          applies to movement programmes (not Budget Meal Plans): see our <a href="/legal/refunds">refund policy</a>.
        </p>
        <h2>Body Regeneration Kitchen membership</h2>
        <p>
          The Kitchen is a monthly membership. When you join you pay the joining fee and your first month together. After that, the monthly price is taken
          on the same date each month until you cancel. The prices are shown before you pay.
        </p>
        <p>
          You can cancel at any time from your account, in two clicks, and we'll email you to confirm. You won't be charged again, and you keep access until
          the end of the month you've paid for. If we ever change the monthly price, we'll tell you by email at least 30 days before it applies, and you can
          cancel before then.
        </p>
        <h2>Access codes</h2>
        <p>
          If your club, gym, employer or charity gave you an access code, your access lasts while that arrangement is in place. If it ends, we may remove
          access given by the code. Beta tester codes give free access in return for honest feedback; we only quote feedback with your permission.
        </p>
        <h2>Your health and safety</h2>
        <p>
          The programmes are education and movement coaching, not medical treatment. Please read the <a href="/legal/health-disclaimer">health disclaimer</a>{" "}
          before you start. You take part at your own risk, and should stop if anything causes pain.
        </p>
        <h2>Our responsibility to you</h2>
        <p>
          We provide the programmes with reasonable care and skill. Nothing in these terms limits our liability where it would be unlawful to do so, including
          for death or personal injury caused by our negligence, or for fraud. Otherwise, our total liability to you is limited to the amount you paid.
        </p>
        <h2>Affiliate programme</h2>
        <p>
          Customers can share a personal link and earn commission on sales made through it. Separate affiliate terms apply, and will be shown when you
          activate your link.
        </p>
        <h2>Law</h2>
        <p>
          These terms are governed by the law of Northern Ireland. If you live elsewhere in the UK or in the EU, you keep the protection of your local consumer
          laws and can bring a claim in your local courts.
        </p>
      </>
    ),
  },
  cookies: {
    title: "Cookie policy",
    description: "The small number of cookies we use, and why.",
    body: () => (
      <>
        <p>We don't use advertising or tracking cookies, and we don't use third-party analytics. We only use cookies the site needs in order to work.</p>
        <h2>Cookies we use</h2>
        <ul>
          <li>
            <strong>Form security</strong> (<code>__Host-brm_csrf</code>): stops other websites submitting forms in your name. It lasts until you close your
            browser.
          </li>
          <li>
            <strong>Login</strong> (members only): keeps you logged in to your account for up to 30 days, or until you log out.
          </li>
          <li>
            <strong>Basket:</strong> remembers what's in your basket.
          </li>
        </ul>
        <h2>Referral links (only if you agree)</h2>
        <p>
          If you arrive through a member's share link, we ask before remembering who referred you. If you say yes, a cookie (<code>brm_ref</code>) holds
          their code for 30 days so they can be thanked if you buy. If you say no, nothing is stored. You can also type a member's code at checkout instead.
        </p>
        <h2>Remembering the sign-up pop-up</h2>
        <p>
          If a sign-up box pops up and you close it or sign up, your browser remembers that (in "local storage", not a cookie) so it doesn't keep
          appearing. It stays on your device and is never sent to us.
        </p>
        <h2>Videos</h2>
        <p>
          Programme videos are hosted on YouTube in privacy-enhanced mode. YouTube may set cookies once you press play. See Google's privacy policy for details.
        </p>
      </>
    ),
  },
  refunds: {
    title: "Refund policy",
    description: "Cancellations and refunds for digital programmes.",
    body: () => (
      <>
        <h2>Our policy</h2>
        <p>
          <strong>{GUARANTEE.title}.</strong> Every movement programme is covered. Budget Meal Plans are not covered by this guarantee. If it isn't for you, email us any time within 90 days of buying and we'll refund
          you in full, whether or not you've used the programme. When the refund is made, your access to that programme ends.
        </p>
        <p>
          We do recommend giving it a proper go and following the programme first. Most people start to notice how much they've been gripping from the
          very first session.
        </p>
        <h2>Your legal rights</h2>
        <p>
          If you're a consumer in the UK or EU, you can cancel within 14 days of buying unless you asked for immediate access and confirmed that you'd lose
          the right to cancel once access began.
        </p>
        <p>
          Whatever the policy above, if a programme is faulty or not as described, you have rights under the Consumer Rights Act 2015, including a repair,
          replacement or refund.
        </p>
        <h2>How to ask</h2>
        <p>
          Email <Text copy={EMAIL} />, or use our <a href="/contact">contact form</a>, with the email address you bought with. Refunds go back to your
          original payment method, usually within 5-10 working days.
        </p>
      </>
    ),
  },
  "affiliate-terms": {
    title: "Affiliate terms",
    description: "The rules for members who share their link and earn commission.",
    body: () => (
      <>
        <p>
          These terms apply if you join our affiliate programme from your account page. They sit alongside our <a href="/legal/terms">terms of sale</a>.
        </p>
        <h2>How it works</h2>
        <ul>
          <li>You get a personal share link and code. When someone buys through it, you earn the commission rate shown on your account page at the time of the sale.</li>
          <li>
            <strong>One level only.</strong> You earn on sales made through your own link. You don't earn on sales made by people you referred, or
            through their links.
          </li>
          <li>
            Commission is held for 90 days after the sale, matching our 90-day money-back guarantee. A refunded sale earns no commission.
          </li>
          <li>
            Once released, commission is paid on the last working day of that month to the payout email you give us, once it reaches the minimum shown in
            your account. For example, a sale on 15 January is released on 15 April and paid on the last working day of April. You're responsible for any
            tax due on what you earn.
          </li>
          <li>
            If someone first buys through your link, you also earn on their further purchases for 12 months, unless they use another member's link.
          </li>
          <li>
            If a sale is refunded or charged back (disputed with their bank) after its commission has been paid, that amount is taken off your next
            payout.
          </li>
          <li>Some partners agree a different commission rate with us in writing. Your rate is always shown on your account page.</li>
          <li>You can't earn commission on your own purchases.</li>
        </ul>
        <h2>When you share</h2>
        <ul>
          <li>
            <strong>Always make it clear you earn from the link</strong>, for example with "#ad" or "I earn commission if you buy through this link". This
            is required by UK advertising rules (and similar rules elsewhere, such as the US FTC's).
          </li>
          <li>
            Share your honest experience. <strong>Don't make health or medical claims</strong>, such as saying the method cures, treats or fixes any
            condition or pain, and don't invent results.
          </li>
          <li>No spam, no fake reviews, and no pretending to be us or speaking on our behalf.</li>
          <li>Don't bid on our name in paid search ads.</li>
        </ul>
        <h2>Ending or pausing</h2>
        <p>
          You can stop sharing at any time. We may pause or end your link if these terms are broken, or change or close the programme with notice. Commission
          already owed for genuine, unrefunded sales will still be paid.
        </p>
        <p>
          <Text copy={placeholder("Owner to confirm: commission rate and minimum payout are set in admin")} />
        </p>
      </>
    ),
  },
  "health-disclaimer": {
    title: "Health disclaimer",
    description: "Important safety information. Please read before starting any programme.",
    body: () => (
      <>
        <p>
          <strong>The Body Regeneration Method is education and movement coaching.</strong> It is not medical advice, diagnosis, treatment or physiotherapy,
          and it does not replace advice from your doctor or physiotherapist.
        </p>
        <h2>Check with a professional first if you</h2>
        <ul>
          <li>have a recent or significant injury, such as a torn muscle, tendon or ligament</li>
          <li>have a condition currently being treated by a physiotherapist or doctor</li>
          <li>are pregnant or have recently given birth</li>
          <li>have had recent surgery</li>
          <li>have a heart condition, high blood pressure, dizziness or balance problems</li>
          <li>have pain without a known cause</li>
        </ul>
        <h2>While you train</h2>
        <ul>
          <li>Work within your limits. The method is about releasing effort, not forcing.</li>
          <li>Stop if anything causes pain, dizziness or discomfort beyond normal effort, and get advice before continuing.</li>
          <li>Use a safe, clear space and stable support where an exercise needs it.</li>
        </ul>
        <p>
          You take part at your own risk. Results vary from person to person, and we make no promise of any particular result.
        </p>
      </>
    ),
  },
};

export function LegalPage(props: { meta: PageMeta; slug: LegalSlug }) {
  const page = LEGAL_PAGES[props.slug];
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <p class="eyebrow">Legal</p>
          <h1>{page.title}</h1>
          <p class="small muted">Last updated {UPDATED}</p>
          <p>
            <Text copy={placeholder("Draft wording: owner and solicitor to review before launch")} />
          </p>
        </div>
      </section>
      <section class="band">
        <div class="wrap narrow prose">{page.body()}</div>
      </section>
    </Layout>
  );
}
