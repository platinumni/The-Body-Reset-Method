import { CsrfField } from "../layout";
import { AdminLayout, type AdminMeta } from "./layout";

const Card = (props: { title: string; children: unknown }) => (
  <section class="auth-wrap admin-login">
    <h1 class="auth-title">{props.title}</h1>
    <div class="card auth-card">{props.children as never}</div>
  </section>
);

export function AdminLoginPage(props: { meta: AdminMeta; notice?: string | null }) {
  return (
    <AdminLayout meta={props.meta} bare>
      <Card title="Admin log in">
        {props.notice && <p class="notice notice-ok">{props.notice}</p>}
        <form method="post" action="/admin/login">
          <CsrfField token={props.meta.csrfToken} />
          <div class="field">
            <label for="email">Email address</label>
            <input id="email" name="email" type="email" autocomplete="username" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn btn-primary btn-wide" type="submit">
            Continue
          </button>
        </form>
      </Card>
    </AdminLayout>
  );
}

export function AdminVerifyPage(props: { meta: AdminMeta }) {
  return (
    <AdminLayout meta={props.meta} bare>
      <Card title="Two-step check">
        <p>Open your authenticator app and enter the 6-digit code for The Body Regeneration Method.</p>
        <form method="post" action="/admin/login/verify">
          <CsrfField token={props.meta.csrfToken} />
          <div class="field">
            <label for="code">6-digit code</label>
            <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength={7} required />
          </div>
          <button class="btn btn-primary btn-wide" type="submit">
            Log in
          </button>
        </form>
        <details>
          <summary>Phone not to hand? Use a backup code</summary>
          <form method="post" action="/admin/login/verify">
            <CsrfField token={props.meta.csrfToken} />
            <div class="field">
              <label for="backup">Backup code</label>
              <input id="backup" name="backup" type="text" autocomplete="off" placeholder="abcde-12345" required />
            </div>
            <button class="btn btn-ghost btn-wide" type="submit">
              Use backup code
            </button>
          </form>
        </details>
      </Card>
    </AdminLayout>
  );
}

export function AdminEnrolPage(props: { meta: AdminMeta; secret: string; qrDataUri: string; otpauth: string }) {
  const grouped = props.secret.match(/.{1,4}/g)!.join(" ");
  return (
    <AdminLayout meta={props.meta} bare>
      <Card title="Set up two-step login">
        <ol class="steps">
          <li>
            Install an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.
          </li>
          <li>
            On this phone? <a href={props.otpauth}>Tap here to add it to your authenticator app</a>. On a computer? Scan this code with your phone:
          </li>
        </ol>
        <img class="qr" src={props.qrDataUri} alt="QR code for your authenticator app" width="220" height="220" />
        <p class="small">
          Can't scan? Type this key instead: <code class="secret">{grouped}</code>
        </p>
        <form method="post" action="/admin/login/enrol">
          <CsrfField token={props.meta.csrfToken} />
          <input type="hidden" name="secret" value={props.secret} />
          <div class="field">
            <label for="code">3. Enter the 6-digit code the app shows</label>
            <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength={7} required />
          </div>
          <button class="btn btn-primary btn-wide" type="submit">
            Turn on two-step login
          </button>
        </form>
      </Card>
    </AdminLayout>
  );
}

export function BackupCodesPage(props: { meta: AdminMeta; codes: string[] }) {
  return (
    <AdminLayout meta={props.meta} bare>
      <Card title="Save your backup codes">
        <p>
          <strong>These are shown once only.</strong> Each code gets you in once if you lose your phone. Screenshot them or write them down, and keep them
          somewhere safe.
        </p>
        <ul class="backup-codes">
          {props.codes.map((c) => (
            <li>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <a class="btn btn-primary btn-wide" href="/admin">
          I've saved them: go to the dashboard
        </a>
      </Card>
    </AdminLayout>
  );
}
