import { RichText } from "../lib/markdown";
import { youtubeEmbedUrl } from "../lib/youtube";
import type { Lesson, OwnedProgramme, Tab } from "../services/library";
import type { SessionUser } from "../services/sessions";
import { AffiliateCard } from "./affiliate";
import { Button } from "./components";
import { CsrfField, Layout, type PageMeta } from "./layout";

export function AccountPage(props: {
  meta: PageMeta;
  csrfToken: string;
  user: SessionUser;
  programmes: OwnedProgramme[];
  marketing: boolean;
  affiliate: Parameters<typeof AffiliateCard>[0];
  notice?: string | null;
  error?: string | null;
}) {
  const { user } = props;
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap">
          <p class="eyebrow">Members' area</p>
          <h1>{user.name ? `Welcome, ${user.name}` : "Your programmes"}</h1>
          {props.notice && (
            <p class="notice notice-ok" role="status">
              {props.notice}
            </p>
          )}
          {props.error && (
            <div class="form-errors" role="alert">
              <p>{props.error}</p>
            </div>
          )}
        </div>
      </section>

      <section class="band band-tight">
        <div class="wrap">
          <h2 class="h3">My programmes</h2>
          {props.programmes.length === 0 ? (
            <div class="card">
              <p>You don't have any programmes yet.</p>
              <Button href="/programmes">See the programmes</Button>
            </div>
          ) : (
            <ul class="library">
              {props.programmes.map((p) => (
                <li class="card library-card">
                  <h3>{p.title}</h3>
                  {p.lessons > 0 ? (
                    <p class="small muted">
                      {p.done} of {p.lessons} sections ticked off
                    </p>
                  ) : (
                    <p class="small muted">Content is being added. We'll email you when it's ready.</p>
                  )}
                  {p.lessons > 0 && (
                    <div class="progress" role="img" aria-label={`${p.done} of ${p.lessons} done`}>
                      <span class={`progress-bar w-${Math.round((p.done / p.lessons) * 20) * 5}`} />
                    </div>
                  )}
                  <Button href={`/account/programmes/${p.slug}`}>{p.done ? "Continue" : "Start here"}</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section class="band band-quiet">
        <div class="wrap account-grid">
          <AffiliateCard {...props.affiliate} />

          <div class="card">
            <h2 class="h3">Your details</h2>
            <p>
              <strong>Email:</strong> {user.email}
            </p>
            <form method="post" action="/logout">
              <CsrfField token={props.csrfToken} />
              <button class="btn btn-ghost btn-small" type="submit">
                Log out
              </button>
            </form>
          </div>

          <div class="card">
            <h2 class="h3">Emails from us</h2>
            <p>You'll always get emails about your orders and account. News and new programmes are optional.</p>
            <form method="post" action="/account/marketing">
              <CsrfField token={props.csrfToken} />
              <input type="hidden" name="marketing" value={props.marketing ? "no" : "yes"} />
              <p>
                Currently: <strong>{props.marketing ? "subscribed" : "not subscribed"}</strong>
              </p>
              <button class="btn btn-ghost btn-small" type="submit">
                {props.marketing ? "Unsubscribe" : "Send me news"}
              </button>
            </form>
          </div>

          <div class="card">
            <h2 class="h3">Change password</h2>
            <form method="post" action="/account/password">
              <CsrfField token={props.csrfToken} />
              <div class="field">
                <label for="current">Current password</label>
                <input id="current" name="current" type="password" autocomplete="current-password" required />
              </div>
              <div class="field">
                <label for="password">New password</label>
                <input id="password" name="password" type="password" autocomplete="new-password" required />
              </div>
              <div class="field">
                <label for="confirm">Confirm new password</label>
                <input id="confirm" name="confirm" type="password" autocomplete="new-password" required />
              </div>
              <button class="btn btn-ghost btn-small" type="submit">
                Change password
              </button>
            </form>
          </div>

          <div class="card">
            <h2 class="h3">Your data</h2>
            <p>Download a copy of everything we hold about you.</p>
            <a class="btn btn-ghost btn-small" href="/account/export">
              Download my data
            </a>
            <details class="danger-zone">
              <summary>Delete my account</summary>
              <p class="small">
                This removes your account and your access to all programmes, permanently. We keep order records for 6 years, because UK tax law
                requires it.
              </p>
              <form method="post" action="/account/delete">
                <CsrfField token={props.csrfToken} />
                <div class="field">
                  <label for="del-password">Type your password to confirm</label>
                  <input id="del-password" name="password" type="password" autocomplete="current-password" required />
                </div>
                <button class="btn btn-danger btn-small" type="submit">
                  Permanently delete my account
                </button>
              </form>
            </details>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export function ReaderPage(props: { meta: PageMeta; csrfToken: string; programme: { slug: string; title: string }; tab: Tab; lessons: Lesson[] }) {
  const { programme, tab } = props;
  const base = `/account/programmes/${programme.slug}`;
  return (
    <Layout meta={props.meta}>
      <section class="page-hero reader-hero">
        <div class="wrap narrow">
          <p class="small">
            <a href="/account">← My programmes</a>
          </p>
          <h1>{programme.title}</h1>
          <nav class="tabs" aria-label="Programme sections">
            <a href={`${base}?tab=full`} aria-current={tab === "full" ? "page" : undefined}>
              Full Programme
            </a>
            <a href={`${base}?tab=quick`} aria-current={tab === "quick" ? "page" : undefined}>
              Quick Run-Through
            </a>
          </nav>
        </div>
      </section>
      <section class="band band-tight">
        <div class="wrap narrow">
          {tab === "full" ? (
            <aside class="key-point read-first">
              <span class="key-point-label">Before you start</span>
              <p>
                Read the Full Programme all the way through before you begin, ideally a few times. The philosophy behind it is what makes the
                exercises work. Once you understand it, use the Quick Run-Through as you train.
              </p>
            </aside>
          ) : (
            <aside class="key-point">
              <span class="key-point-label">Quick Run-Through</span>
              <p>The key points of each stage, to keep beside you while you train. New here? Read the Full Programme first.</p>
            </aside>
          )}

          {props.lessons.length === 0 ? (
            <p class="notice">This section is being prepared. We'll email you when it's ready.</p>
          ) : (
            <>
              <nav class="toc" aria-label="Contents">
                <h2 class="h3">Contents</h2>
                <ol>
                  {props.lessons.map((l) => (
                    <li>
                      <a href={`#lesson-${l.id}`}>{l.title}</a>
                      {!!l.done && <span class="done-mark"> ✓</span>}
                    </li>
                  ))}
                </ol>
              </nav>
              {props.lessons.map((l, i) => (
                <article class="lesson" id={`lesson-${l.id}`}>
                  <p class="eyebrow">
                    {tab === "full" ? "Section" : "Key points"} {i + 1}
                  </p>
                  <h2>{l.title}</h2>
                  {l.youtube_id && (
                    <div class="video">
                      <iframe
                        src={youtubeEmbedUrl(l.youtube_id)}
                        title={`Video: ${l.title}`}
                        loading="lazy"
                        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        referrerpolicy="strict-origin-when-cross-origin"
                        allowfullscreen
                      />
                    </div>
                  )}
                  {l.image_key && <img class="lesson-image" src={`/media/${l.image_key}`} alt={l.image_alt ?? ""} loading="lazy" />}
                  <div class="prose">
                    <RichText source={l.body} />
                  </div>
                  <form method="post" action={`${base}/progress`} class="lesson-done">
                    <CsrfField token={props.csrfToken} />
                    <input type="hidden" name="lesson" value={String(l.id)} />
                    <input type="hidden" name="tab" value={tab} />
                    <input type="hidden" name="done" value={l.done ? "no" : "yes"} />
                    <button class={`btn btn-small ${l.done ? "btn-ghost" : "btn-primary"}`} type="submit">
                      {l.done ? "✓ Done (undo)" : "Mark as done"}
                    </button>
                  </form>
                </article>
              ))}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
