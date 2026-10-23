import { Hono } from "hono";
import type { AppEnv } from "../env";
import { setMarketing } from "../services/accounts";
import { checkUnsubscribeToken } from "../services/campaigns";
import { Layout } from "../views/layout";
import { pageMeta } from "./meta";

// One-click unsubscribe from news emails. The signed link proves the email address;
// mail apps may POST to it directly (List-Unsubscribe-Post), so no CSRF token here.

export const unsubscribeRoutes = new Hono<AppEnv>();

const params = (c: { req: { query: (k: string) => string | undefined } }) => ({ email: (c.req.query("e") ?? "").toLowerCase(), token: c.req.query("t") ?? "" });

unsubscribeRoutes.get("/unsubscribe", async (c) => {
  const { email, token } = params(c);
  const valid = await checkUnsubscribeToken(c.env, email, token);
  const meta = pageMeta(c, { title: "Unsubscribe", description: "Unsubscribe from news emails.", path: "/unsubscribe", noindex: true });
  return c.html(
    <Layout meta={meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          {valid ? (
            <>
              <h1>Unsubscribe from news emails?</h1>
              <p>
                This stops news and new-programme emails to <strong>{email}</strong>. You'll still get emails about your orders and account.
              </p>
              <form method="post" action={`/unsubscribe?e=${encodeURIComponent(email)}&t=${token}`}>
                <button class="btn btn-primary" type="submit">
                  Unsubscribe
                </button>
              </form>
            </>
          ) : (
            <>
              <h1>That link doesn't work</h1>
              <p>
                It may have been copied incompletely. You can also change email preferences from <a href="/account">your account</a>.
              </p>
            </>
          )}
        </div>
      </section>
    </Layout>,
    valid ? 200 : 400,
  );
});

unsubscribeRoutes.post("/unsubscribe", async (c) => {
  const { email, token } = params(c);
  if (!(await checkUnsubscribeToken(c.env, email, token))) return c.text("Invalid unsubscribe link", 400);
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?1 AND deleted_at IS NULL").bind(email).first<number>("id");
  await setMarketing(c.env.DB, { id: user ?? null, email }, false, "unsubscribe-link");
  const meta = pageMeta(c, { title: "Unsubscribed", description: "Unsubscribed.", path: "/unsubscribe", noindex: true });
  return c.html(
    <Layout meta={meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <h1>You're unsubscribed</h1>
          <p>We won't send you news emails any more. Changed your mind? You can turn them back on from your account.</p>
        </div>
      </section>
    </Layout>,
  );
});
