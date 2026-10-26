import { CHECKOUT_CONSENTS } from "../content/consents";
import { CODE_CONSENTS } from "../services/access-codes";
import { CsrfField, Layout, type PageMeta } from "./layout";

const LINKS: Partial<Record<(typeof CODE_CONSENTS)[number], { href: string; text: string }>> = {
  health_declaration: { href: "/legal/health-disclaimer", text: "Read the health disclaimer" },
  terms: { href: "/legal/terms", text: "Read the terms" },
};

/** Use an access code from a club, gym, employer, charity or the beta programme. */
export function RedeemPage(props: { meta: PageMeta; csrfToken: string; code?: string; email?: string; errors?: string[]; sentTo?: string }) {
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <h1>Use your access code</h1>
          {props.sentTo ? (
            <>
              <p class="lede">Check your inbox. If the code is valid, we've emailed {props.sentTo} a link to unlock your access.</p>
              <p>The link lasts 7 days. Can't see it? Check your spam or promotions folder.</p>
            </>
          ) : (
            <>
              <p class="lede">Got a code from your club, gym, workplace or charity, or as a beta tester? Enter it here.</p>
              {props.errors?.length ? (
                <div class="form-errors" role="alert">
                  {props.errors.map((e) => (
                    <p>{e}</p>
                  ))}
                </div>
              ) : null}
              <form method="post" action="/redeem" class="card">
                <CsrfField token={props.csrfToken} />
                <div class="field">
                  <label for="rd-code">Access code</label>
                  <input id="rd-code" name="code" type="text" autocomplete="off" required maxlength={24} value={props.code ?? ""} />
                </div>
                <div class="field">
                  <label for="rd-email">Your email</label>
                  <input id="rd-email" name="email" type="email" autocomplete="email" required value={props.email ?? ""} />
                  <p class="hint">We'll email you a link to confirm it's you. Your access is linked to this address.</p>
                </div>
                {CODE_CONSENTS.map((k) => (
                  <div class="check">
                    <input type="checkbox" id={`rd-${k}`} name={k} value="yes" required />
                    <label for={`rd-${k}`}>
                      {k === "terms" ? "I agree to the terms and have read the privacy policy." : CHECKOUT_CONSENTS[k].label}{" "}
                      {LINKS[k] && (
                        <a href={LINKS[k]!.href} target="_blank" rel="noopener">
                          {LINKS[k]!.text}
                        </a>
                      )}
                    </label>
                  </div>
                ))}
                <button class="btn btn-primary" type="submit">
                  Unlock my access
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
