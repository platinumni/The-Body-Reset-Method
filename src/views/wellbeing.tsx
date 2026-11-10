import { thoughtForDay, TRADITIONS, type Tradition } from "../content/reflections";
import { BELIEF_CONSENT, MOODS, PLAN_KINDS, type DiaryEntry, type Plan } from "../services/wellbeing";
import { CsrfField, Layout, type PageMeta } from "./layout";

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayName = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
const moodLabel = (m: number) => MOODS.find((x) => x.value === m)?.label ?? "";

const Back = () => (
  <p class="small">
    <a href="/account/team">← Your dashboard</a>
  </p>
);

/** Today's mood check-in: five buttons, private to the employee. */
export function MoodCard(props: { csrfToken: string; today: string; mood: number | null; moods: Record<string, number> }) {
  return (
    <article class="card" id="mood">
      <h2 class="h3">How are you today?</h2>
      <form method="post" action="/account/team/mood" class="mood-form">
        <CsrfField token={props.csrfToken} />
        {MOODS.map((m) => (
          <button class={`mood-btn${props.mood === m.value ? " is-on" : ""}`} type="submit" name="mood" value={String(m.value)} aria-pressed={props.mood === m.value ? "true" : "false"}>
            <span class="mood-dot" data-mood={String(m.value)} aria-hidden="true" />
            {m.label}
          </button>
        ))}
      </form>
      <MoodChart today={props.today} moods={props.moods} />
      <p class="small muted">
        Only you can see this. Your employer never does. If you're struggling, talk to your GP, or call Samaritans free on 116 123, any time.
      </p>
    </article>
  );
}

/** Mood over the last 14 days: one series of dots on a 1-5 scale, gaps where there's no check-in. */
export function MoodChart(props: { today: string; moods: Record<string, number> }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(props.today, i - 13));
  if (!days.some((d) => props.moods[d])) return <p class="small muted">Check in each day to see how your weeks go.</p>;
  const W = 320;
  const H = 120;
  const pad = { top: 10, bottom: 22, left: 64, right: 8 };
  const step = (W - pad.left - pad.right) / (days.length - 1);
  const y = (m: number) => pad.top + ((5 - m) / 4) * (H - pad.top - pad.bottom);
  const pts = days.map((d, i) => ({ d, x: pad.left + i * step, m: props.moods[d] ?? null }));
  // The line joins neighbouring check-ins only, so a missed day shows as a gap.
  const segs: string[] = [];
  for (let i = 1; i < pts.length; i++) if (pts[i - 1]!.m && pts[i]!.m) segs.push(`M${pts[i - 1]!.x},${y(pts[i - 1]!.m!)} L${pts[i]!.x},${y(pts[i]!.m!)}`);
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="mood-title" class="chart-svg">
        <title id="mood-title">Your mood over the last 14 days</title>
        {[1, 3, 5].map((m) => (
          <>
            <line class="chart-grid" x1={pad.left} x2={W - pad.right} y1={y(m)} y2={y(m)} />
            <text class="chart-label" x={pad.left - 6} y={y(m) + 3} text-anchor="end">
              {moodLabel(m)}
            </text>
          </>
        ))}
        {segs.map((d) => (
          <path class="chart-line" d={d} />
        ))}
        {pts.map((p) =>
          p.m ? (
            <g class="chart-bar">
              <title>
                {dayName(p.d, { weekday: "short", day: "numeric", month: "short" })}: {moodLabel(p.m)}
              </title>
              <rect class="chart-hit" x={p.x - step / 2} y={pad.top} width={step} height={H - pad.top - pad.bottom} />
              <circle class="chart-dot" cx={p.x} cy={y(p.m)} r={4} />
            </g>
          ) : null,
        )}
        <text class="chart-label" x={pad.left} y={H - 6} text-anchor="start">
          {dayName(days[0]!, { day: "numeric", month: "short" })}
        </text>
        <text class="chart-label" x={W - pad.right} y={H - 6} text-anchor="end">
          Today
        </text>
      </svg>
      <table class="sr-only">
        <caption>Your mood over the last 14 days</caption>
        {days.map((d) => (
          <tr>
            <td>{dayName(d, { weekday: "short", day: "numeric", month: "short" })}</td>
            <td>{props.moods[d] ? moodLabel(props.moods[d]!) : "No check-in"}</td>
          </tr>
        ))}
      </table>
    </figure>
  );
}

function PlanItem(props: { p: Plan; csrfToken: string }) {
  const { p } = props;
  return (
    <li class={`plan-item${p.done_at ? " is-done" : ""}`}>
      <span>
        {p.time && <strong>{p.time} </strong>}
        {p.title} <span class="small muted">· {PLAN_KINDS[p.kind]}</span>
      </span>
      <span class="plan-actions">
        <form method="post" action="/account/team/plan" class="inline-form">
          <CsrfField token={props.csrfToken} />
          <input type="hidden" name="id" value={String(p.id)} />
          <input type="hidden" name="day" value={p.day} />
          <input type="hidden" name="action" value={p.done_at ? "undo" : "done"} />
          <button class="btn btn-ghost btn-small" type="submit" aria-label={p.done_at ? `Mark "${p.title}" not done` : `Mark "${p.title}" done`}>
            {p.done_at ? "✓ Done" : "Done?"}
          </button>
        </form>
        <form method="post" action="/account/team/plan" class="inline-form">
          <CsrfField token={props.csrfToken} />
          <input type="hidden" name="id" value={String(p.id)} />
          <input type="hidden" name="day" value={p.day} />
          <input type="hidden" name="action" value="delete" />
          <button class="btn btn-ghost btn-small" type="submit" aria-label={`Remove "${p.title}"`}>
            Remove
          </button>
        </form>
      </span>
    </li>
  );
}

/** Today's plans on the dashboard. */
export function TodayPlans(props: { plans: Plan[]; csrfToken: string }) {
  return (
    <article class="card">
      <h2 class="h3">Today's plan</h2>
      {props.plans.length ? (
        <ul class="plan-list">
          {props.plans.map((p) => (
            <PlanItem p={p} csrfToken={props.csrfToken} />
          ))}
        </ul>
      ) : (
        <p class="small muted">Nothing planned for today.</p>
      )}
      <p class="small">
        <a href="/account/team/week">My week</a> · <a href="/account/team/diary">My diary</a>
      </p>
    </article>
  );
}

/** The week planner: seven days, each with its plans, sessions done and mood; add a plan at the bottom. */
export function WeekPage(props: { meta: PageMeta; csrfToken: string; from: string; today: string; plans: Plan[]; sessions: Record<string, number>; moods: Record<string, number>; error: string | null }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(props.from, i));
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <Back />
          <h1>My week</h1>
          <p class="lede">Plan your sessions, courses and meals. A little, often.</p>
          <p class="week-nav">
            <a class="btn btn-ghost btn-small" href={`/account/team/week?from=${addDays(props.from, -7)}`}>
              ← Last week
            </a>
            <span>
              {dayName(days[0]!, { day: "numeric", month: "short" })} to {dayName(days[6]!, { day: "numeric", month: "short" })}
            </span>
            <a class="btn btn-ghost btn-small" href={`/account/team/week?from=${addDays(props.from, 7)}`}>
              Next week →
            </a>
          </p>
        </div>
      </section>
      <section class="band band-tight">
        <div class="wrap narrow">
          <ol class="week-days">
            {days.map((d) => {
              const plans = props.plans.filter((p) => p.day === d);
              return (
                <li class={`card week-day${d === props.today ? " is-today" : ""}`} id={`d-${d}`}>
                  <h2 class="h4">
                    {dayName(d, { weekday: "long", day: "numeric", month: "short" })}
                    {d === props.today && <span class="tag">Today</span>}
                  </h2>
                  {(props.sessions[d] || props.moods[d]) && (
                    <p class="small muted">
                      {props.sessions[d] ? `${props.sessions[d]} session${props.sessions[d] === 1 ? "" : "s"} done` : ""}
                      {props.sessions[d] && props.moods[d] ? " · " : ""}
                      {props.moods[d] ? `Feeling: ${moodLabel(props.moods[d]!)}` : ""}
                    </p>
                  )}
                  {plans.length > 0 && (
                    <ul class="plan-list">
                      {plans.map((p) => (
                        <PlanItem p={p} csrfToken={props.csrfToken} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          <form method="post" action="/account/team/plan" class="card" id="add">
            <h2 class="h3">Add to my week</h2>
            {props.error && (
              <p class="form-errors" role="alert">
                {props.error}
              </p>
            )}
            <CsrfField token={props.csrfToken} />
            <input type="hidden" name="action" value="add" />
            <div class="field">
              <label for="pl-title">What</label>
              <input id="pl-title" name="title" type="text" maxlength={120} required placeholder="e.g. Toe yoga before work" />
            </div>
            <div class="field-row">
              <div class="field">
                <label for="pl-day">Day</label>
                <select id="pl-day" name="day">
                  {days.map((d) => (
                    <option value={d} selected={d === (days.includes(props.today) ? props.today : days[0])}>
                      {dayName(d, { weekday: "long", day: "numeric", month: "short" })}
                    </option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label for="pl-time">Time (optional)</label>
                <input id="pl-time" name="time" type="time" />
              </div>
            </div>
            <div class="field">
              <label for="pl-kind">Kind</label>
              <select id="pl-kind" name="kind">
                {Object.entries(PLAN_KINDS).map(([k, v]) => (
                  <option value={k}>{v}</option>
                ))}
              </select>
            </div>
            <button class="btn btn-primary" type="submit">
              Add
            </button>
          </form>
        </div>
      </section>
    </Layout>
  );
}

/** The private diary: write today's entry, read back recent ones. */
export function DiaryPage(props: { meta: PageMeta; csrfToken: string; today: string; entries: DiaryEntry[]; available: boolean; notice: string | null }) {
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <Back />
          <h1>My diary</h1>
          <p class="lede">A private place to note how things are going. Only you can read it: it's stored encrypted, and your employer never sees it.</p>
        </div>
      </section>
      <section class="band band-tight">
        <div class="wrap narrow">
          {props.notice && (
            <p class="notice notice-ok" role="status">
              {props.notice}
            </p>
          )}
          {props.available ? (
            <form method="post" action="/account/team/diary" class="card">
              <CsrfField token={props.csrfToken} />
              <input type="hidden" name="day" value={props.today} />
              <div class="field">
                <label for="diary-body">Today, {dayName(props.today, { weekday: "long", day: "numeric", month: "long" })}</label>
                <textarea id="diary-body" name="body" rows={6} maxlength={4000} required placeholder="What went well? What felt tense? What did you let go of?" />
              </div>
              <button class="btn btn-primary" type="submit">
                Save
              </button>
            </form>
          ) : (
            <p class="notice">The diary isn't switched on yet.</p>
          )}
          {props.entries.map((e) => (
            <article class="card diary-entry">
              <h2 class="h4">{dayName(e.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
              <p class="diary-text">{e.body}</p>
              <form method="post" action="/account/team/diary" class="inline-form">
                <CsrfField token={props.csrfToken} />
                <input type="hidden" name="id" value={String(e.id)} />
                <input type="hidden" name="action" value="delete" />
                <button class="btn btn-ghost btn-small" type="submit">
                  Delete
                </button>
              </form>
            </article>
          ))}
          <p class="small muted">If you're struggling, please talk to someone: your GP, or Samaritans free on 116 123, any time, day or night.</p>
        </div>
      </section>
    </Layout>
  );
}

/** Today's thought: a reflection from the Method, plus words from their chosen faith or belief once verified ones exist. */
export function ThoughtCard(props: { csrfToken: string; today: string; tradition: Tradition | null; needConsent?: boolean }) {
  const t = thoughtForDay(props.today, props.tradition);
  return (
    <article class="card thought" id="thought">
      <p class="eyebrow">Today's thought</p>
      <blockquote class="thought-text">{t.reflection}</blockquote>
      {t.words ? (
        <blockquote class="thought-words">
          {t.words.text}
          <footer class="small muted">{t.words.source}</footer>
        </blockquote>
      ) : (
        props.tradition &&
        props.tradition !== "other" && <p class="small muted">Daily words for {TRADITIONS[props.tradition]} are being prepared and checked. They'll appear here.</p>
      )}
      <details class="thought-choose">
        <summary>{props.tradition ? `Your daily words: ${TRADITIONS[props.tradition]}` : "Add words from your faith or belief (optional)"}</summary>
        <form method="post" action="/account/team/words">
          <CsrfField token={props.csrfToken} />
          <div class="field">
            <label for="tw-tradition">Daily words from</label>
            <select id="tw-tradition" name="tradition">
              {(Object.entries(TRADITIONS) as [Tradition, string][]).map(([k, v]) => (
                <option value={k} selected={(props.tradition ?? "none") === k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div class="check">
            <input type="checkbox" id="tw-consent" name="consent" value="yes" />
            <label for="tw-consent">{BELIEF_CONSENT.label}</label>
          </div>
          {props.needConsent && (
            <p class="form-errors" role="alert">
              Please tick the box to save your choice, or choose "None".
            </p>
          )}
          <button class="btn btn-ghost btn-small" type="submit">
            Save
          </button>
          <p class="small muted">Optional, and never shown to your employer. Choose "None" to remove it.</p>
        </form>
      </details>
    </article>
  );
}
