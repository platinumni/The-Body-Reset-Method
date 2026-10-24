import { plainText, RichText } from "../lib/markdown";
import { youtubeEmbedUrl } from "../lib/youtube";
import { groupByStage, type Lesson, type Mode, type OwnedProgramme } from "../services/library";
import type { SessionUser } from "../services/sessions";
import { AffiliateCard } from "./affiliate";
import { Button } from "./components";
import { assetUrl } from "../routes/assets";
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

const MODE_LABELS: Record<Mode, string> = { guide: "Full guide", listen: "Listen", points: "Key points", sheet: "Exercise sheet" };

function DoneButton(props: { base: string; mode: Mode; lesson: Lesson; csrfToken: string }) {
  const l = props.lesson;
  return (
    <form method="post" action={`${props.base}/progress`} class="lesson-done">
      <CsrfField token={props.csrfToken} />
      <input type="hidden" name="lesson" value={String(l.id)} />
      <input type="hidden" name="mode" value={props.mode} />
      <input type="hidden" name="done" value={l.done ? "no" : "yes"} />
      <button class={`btn btn-small ${l.done ? "btn-ghost" : "btn-primary"}`} type="submit">
        {l.done ? "✓ Done (undo)" : "Mark as done"}
      </button>
    </form>
  );
}

function DemoVideo(props: { id: string; title: string; collapsed?: boolean }) {
  const frame = (
    <div class="video">
      <iframe
        src={youtubeEmbedUrl(props.id)}
        title={`Demonstration: ${props.title}`}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      />
    </div>
  );
  return (
    <div class="demo">
      <p class="demo-note">
        <strong>Demonstration video.</strong> This shows what the movement looks like, nothing more. The real work is in the starting position and the
        guidance, so read those first.
      </p>
      {props.collapsed ? (
        <details>
          <summary>Watch the demonstration</summary>
          {frame}
        </details>
      ) : (
        frame
      )}
    </div>
  );
}

const TimeNote = (props: { time: string | null }) =>
  props.time ? (
    <p class="time-note">
      <strong>Suggested time:</strong> {props.time}. Tune in to your body rather than the clock.
    </p>
  ) : null;

function HowToUse(props: { open: boolean }) {
  return (
    <details class="how-to-use" open={props.open}>
      <summary>How to use this programme</summary>
      <ol>
        <li>
          <strong>Full guide:</strong> read everything for the first week or two, especially the starting positions.
        </li>
        <li>
          <strong>Listen:</strong> once you know the ideas, press play and follow along as you practise.
        </li>
        <li>
          <strong>Key points:</strong> when you're comfortable, use the short version.
        </li>
        <li>
          <strong>Exercise sheet:</strong> eventually, the whole programme on one page.
        </li>
      </ol>
      <p class="small">
        There's structure and there are suggested times, but too much structure becomes too much control. Use them as a guide, and tune in to your body.
      </p>
    </details>
  );
}

function StageHeading(props: { stage: string | null }) {
  return props.stage ? <h2 class="stage-heading">{props.stage}</h2> : null;
}

/** Text read aloud for one item: sections read their body; exercises read their parts in order. */
function spokenText(l: Lesson): string {
  if (l.kind !== "exercise") return `${l.title}. ${plainText(l.body)}`;
  return [
    `${l.title}.`,
    l.starting_position ? `Starting position. ${plainText(l.starting_position)}` : "",
    l.conducting ? `Conducting the exercise. ${plainText(l.conducting)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function ReaderPage(props: { meta: PageMeta; csrfToken: string; programme: { slug: string; title: string }; mode: Mode; lessons: Lesson[] }) {
  const { programme, mode } = props;
  const base = `/account/programmes/${programme.slug}`;
  const sections = props.lessons.filter((l) => l.kind === "section");
  const exercises = props.lessons.filter((l) => l.kind === "exercise");
  // Guide and Listen: written sections from the Full tab plus exercises. Key points: Quick-tab sections plus exercises.
  const forMode = (m: Mode) => props.lessons.filter((l) => l.kind === "exercise" || (m === "points" ? l.tab === "quick" : l.tab === "full"));
  const empty = <p class="notice">This part is being prepared. We'll email you when it's ready.</p>;

  return (
    <Layout meta={props.meta}>
      <section class={`page-hero reader-hero mode-${mode}`}>
        <div class="wrap narrow">
          <p class="small no-print">
            <a href="/account">← My programmes</a>
          </p>
          <h1>{programme.title}</h1>
          <nav class="tabs no-print" aria-label="Ways to use this programme">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <a href={`${base}?mode=${m}`} aria-current={mode === m ? "page" : undefined}>
                {MODE_LABELS[m]}
              </a>
            ))}
          </nav>
        </div>
      </section>
      <section class="band band-tight">
        <div class="wrap narrow">
          {mode !== "sheet" && <HowToUse open={mode === "guide"} />}

          {mode === "guide" &&
            (forMode("guide").length === 0
              ? empty
              : groupByStage(forMode("guide")).map((g) => (
                  <>
                    <StageHeading stage={g.stage} />
                    {g.lessons.map((l) =>
                      l.kind === "exercise" ? (
                        <article class="lesson exercise" id={`lesson-${l.id}`}>
                          <p class="eyebrow">Exercise</p>
                          <h2>{l.title}</h2>
                          <TimeNote time={l.recommended_time} />
                          <h3 class="part-title">1. Starting position</h3>
                          <p class="part-note">The most important part of the movement. Take your time here, and get it right before going further.</p>
                          <div class="prose">
                            <RichText source={l.starting_position ?? ""} />
                          </div>
                          <h3 class="part-title">2. Conducting the exercise</h3>
                          <div class="prose">
                            <RichText source={l.conducting ?? ""} />
                          </div>
                          {l.image_key && <img class="lesson-image" src={`/media/${l.image_key}`} alt={l.image_alt ?? ""} loading="lazy" />}
                          {l.youtube_id && <DemoVideo id={l.youtube_id} title={l.title} />}
                          <DoneButton base={base} mode={mode} lesson={l} csrfToken={props.csrfToken} />
                        </article>
                      ) : (
                        <article class="lesson" id={`lesson-${l.id}`}>
                          <h2>{l.title}</h2>
                          {l.youtube_id && <DemoVideo id={l.youtube_id} title={l.title} />}
                          {l.image_key && <img class="lesson-image" src={`/media/${l.image_key}`} alt={l.image_alt ?? ""} loading="lazy" />}
                          <div class="prose">
                            <RichText source={l.body} />
                          </div>
                          <DoneButton base={base} mode={mode} lesson={l} csrfToken={props.csrfToken} />
                        </article>
                      ),
                    )}
                  </>
                )))}

          {mode === "listen" && (
            <>
              <div class="listen-controls card">
                <p>
                  Press play and follow along. This uses your device's built-in voice, so it works offline once the page has loaded and costs nothing.
                </p>
                <label for="listen-speed">Speed</label>
                <select id="listen-speed">
                  <option value="0.85">Slower</option>
                  <option value="0.95" selected>
                    Normal
                  </option>
                  <option value="1.1">Faster</option>
                </select>
                <button class="btn btn-ghost btn-small" type="button" data-listen-stop>
                  ■ Stop
                </button>
                <p class="small muted listen-unsupported" hidden>
                  Your browser can't read aloud. Try Safari or Chrome on a recent phone.
                </p>
                <noscript>
                  <p class="small">Listening needs JavaScript switched on in your browser.</p>
                </noscript>
              </div>
              {forMode("listen").length === 0
                ? empty
                : groupByStage(forMode("listen")).map((g) => (
                    <>
                      <StageHeading stage={g.stage} />
                      <ul class="listen-list">
                        {g.lessons.map((l) => (
                          <li class="listen-item">
                            <button class="btn btn-primary btn-small listen-btn" type="button" data-listen={`say-${l.id}`} aria-label={`Play ${l.title}`}>
                              ▶ Play
                            </button>
                            <div>
                              <strong>{l.title}</strong>
                              {l.recommended_time && <span class="small muted"> · {l.recommended_time}</span>}
                              <details>
                                <summary class="small">Show the words</summary>
                                <p class="small" id={`say-${l.id}`}>
                                  {spokenText(l)}
                                </p>
                              </details>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ))}
            </>
          )}

          {mode === "points" &&
            (forMode("points").length === 0
              ? empty
              : groupByStage(forMode("points")).map((g) => (
                  <>
                    <StageHeading stage={g.stage} />
                    {g.lessons.map((l) => (
                      <article class="lesson lesson-compact" id={`lesson-${l.id}`}>
                        <h2 class="h3">{l.title}</h2>
                        <TimeNote time={l.recommended_time} />
                        <div class="prose">
                          <RichText source={(l.kind === "exercise" ? l.key_points : l.body) ?? ""} />
                        </div>
                        {l.youtube_id && <DemoVideo id={l.youtube_id} title={l.title} collapsed />}
                      </article>
                    ))}
                  </>
                )))}

          {mode === "sheet" && (
            <div class="sheet">
              <div class="row-between no-print">
                <p class="small muted">The exercises only, on one page. Print it, or save it as a PDF to keep on your phone.</p>
                <button class="btn btn-ghost btn-small" type="button" data-print>
                  Print or save as PDF
                </button>
              </div>
              <h2 class="sheet-title">{programme.title}: exercise sheet</h2>
              {exercises.length === 0
                ? empty
                : groupByStage(exercises).map((g) => (
                    <section class="sheet-stage">
                      {g.stage && <h3>{g.stage}</h3>}
                      <ol>
                        {g.lessons.map((l) => (
                          <li>
                            <strong>{l.title}</strong>
                            {l.recommended_time && <span class="sheet-time"> · {l.recommended_time}</span>}
                            {l.sheet_line && <span class="sheet-line">{l.sheet_line}</span>}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
              <p class="sheet-foot small">Tune in to your body rather than the clock. Stop if anything causes pain.</p>
            </div>
          )}
          {sections.length + exercises.length > 0 && mode !== "sheet" && <p class="small muted no-print">{props.lessons.filter((l) => l.done).length} of {props.lessons.length} marked as done.</p>}
        </div>
      </section>
      {(mode === "listen" || mode === "sheet") && <script src={assetUrl("/reader.js")} defer />}
    </Layout>
  );
}
