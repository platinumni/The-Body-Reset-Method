import type { Child } from "hono/jsx";
import { PASSWORD_MIN } from "../services/accounts";
import { CsrfField, Layout, type PageMeta } from "./layout";

function AuthShell(props: { meta: PageMeta; eyebrow?: string; title: string; children: Child }) {
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap auth-wrap">
          {props.eyebrow && <p class="eyebrow">{props.eyebrow}</p>}
          <h1 class="auth-title">{props.title}</h1>
          <div class="card auth-card">{props.children}</div>
        </div>
      </section>
    </Layout>
  );
}

const Errors = (props: { error?: string | null }) =>
  props.error ? (
    <div class="form-errors" role="alert">
      <p>{props.error}</p>
    </div>
  ) : null;

function PasswordFields(props: { autocomplete: "new-password" }) {
  return (
    <>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete={props.autocomplete} minlength={PASSWORD_MIN} required aria-describedby="pw-hint" />
        <p class="hint" id="pw-hint">
          At least {PASSWORD_MIN} characters. A short phrase is easiest to remember.
        </p>
      </div>
      <div class="field">
        <label for="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autocomplete={props.autocomplete} minlength={PASSWORD_MIN} required />
      </div>
    </>
  );
}

export function SetupPage(props: { meta: PageMeta; csrfToken: string; token: string; email: string | null; error?: string | null }) {
  if (!props.email) {
    return (
      <AuthShell meta={props.meta} title="This link has expired">
        <p>Account links work once and last 7 days. Request a fresh one with the email address you bought with.</p>
        <a class="btn btn-primary" href="/forgot">
          Send me a new link
        </a>
      </AuthShell>
    );
  }
  return (
    <AuthShell meta={props.meta} eyebrow="Welcome" title="Create your account">
      <p>
        Your programmes are linked to <strong>{props.email}</strong>. Choose a password to open them.
      </p>
      <Errors error={props.error} />
      <form method="post" action="/account/setup">
        <CsrfField token={props.csrfToken} />
        <input type="hidden" name="token" value={props.token} />
        <div class="field">
          <label for="name">Your first name (optional)</label>
          <input id="name" name="name" type="text" autocomplete="given-name" maxlength={100} />
        </div>
        <PasswordFields autocomplete="new-password" />
        <button class="btn btn-primary btn-wide" type="submit">
          Create account
        </button>
      </form>
    </AuthShell>
  );
}

export function LoginPage(props: { meta: PageMeta; csrfToken: string; next: string; email?: string; error?: string | null; notice?: string | null }) {
  return (
    <AuthShell meta={props.meta} eyebrow="Members" title="Log in">
      {props.notice && <p class="notice notice-ok">{props.notice}</p>}
      <Errors error={props.error} />
      <form method="post" action="/login">
        <CsrfField token={props.csrfToken} />
        <input type="hidden" name="next" value={props.next} />
        <div class="field">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" autocomplete="email" value={props.email ?? ""} required />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary btn-wide" type="submit">
          Log in
        </button>
      </form>
      <p class="small">
        <a href="/forgot">Forgotten your password, or never set one up?</a>
      </p>
    </AuthShell>
  );
}

export function ForgotPage(props: { meta: PageMeta; csrfToken: string; sent?: boolean; error?: string | null }) {
  return (
    <AuthShell meta={props.meta} title="Get a login link">
      {props.sent ? (
        <p class="notice notice-ok" role="status">
          If that email address has an account or a purchase, we've sent it a link. Check your inbox (and spam folder). The link works once.
        </p>
      ) : (
        <>
          <p>Enter the email address you bought with. We'll send a link to reset your password, or to finish setting up your account.</p>
          <Errors error={props.error} />
          <form method="post" action="/forgot">
            <CsrfField token={props.csrfToken} />
            <div class="field">
              <label for="email">Email address</label>
              <input id="email" name="email" type="email" autocomplete="email" required />
            </div>
            <button class="btn btn-primary btn-wide" type="submit">
              Send link
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export function ResetPage(props: { meta: PageMeta; csrfToken: string; token: string; valid: boolean; error?: string | null }) {
  if (!props.valid) {
    return (
      <AuthShell meta={props.meta} title="This link has expired">
        <p>Password links work once and last an hour.</p>
        <a class="btn btn-primary" href="/forgot">
          Send me a new link
        </a>
      </AuthShell>
    );
  }
  return (
    <AuthShell meta={props.meta} title="Choose a new password">
      <Errors error={props.error} />
      <form method="post" action="/reset">
        <CsrfField token={props.csrfToken} />
        <input type="hidden" name="token" value={props.token} />
        <PasswordFields autocomplete="new-password" />
        <button class="btn btn-primary btn-wide" type="submit">
          Save new password
        </button>
      </form>
    </AuthShell>
  );
}
