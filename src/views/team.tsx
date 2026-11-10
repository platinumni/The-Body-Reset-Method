import { TEAM_SAFETY, type TeamSession } from "../content/team-sessions";
import type { TeamDashboard, WeekBar } from "../services/team";
import { Button } from "./components";
import { MoodCard, ThoughtCard, TodayPlans } from "./wellbeing";
import { CsrfField, Layout, type PageMeta } from "./layout";

const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Sessions per week as a bar chart (one series, so no legend). Each bar has a hover tooltip, and the numbers are also in a table for screen readers. */
export function WeeklyChart(props: { weeks: WeekBar[] }) {
  const W = 320;
  const H = 140;
  const pad = { top: 16, bottom: 24, left: 4, right: 4 };
  const max = Math.max(3, ...props.weeks.map((w) => w.sessions));
  const slot = (W - pad.left - pad.right) / props.weeks.length;
  const barW = Math.min(28, slot - 6);
  const plotH = H - pad.top - pad.bottom;
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="wk-title" class="chart-svg">
        <title id="wk-title">Sessions each week, last {props.weeks.length} weeks</title>
        <line class="chart-baseline" x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} />
        {props.weeks.map((w, i) => {
          const h = w.sessions ? Math.max(4, (w.sessions / max) * plotH) : 0;
          const x = pad.left + i * slot + (slot - barW) / 2;
          const y = H - pad.bottom - h;
          const last = i === props.weeks.length - 1;
          return (
            <g class="chart-bar">
              <title>
                Week of {shortDate(w.start)}: {w.sessions} session{w.sessions === 1 ? "" : "s"}, {w.minutes} min
              </title>
              {/* Bigger invisible hit area than the bar, for touch and hover */}
              <rect class="chart-hit" x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} />
              {h > 0 && <path class="chart-mark" d={`M${x},${H - pad.bottom} V${y + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${H - pad.bottom} Z`} />}
              {(last || w.sessions === max) && w.sessions > 0 && (
                <text class="chart-value" x={x + barW / 2} y={y - 4} text-anchor="middle">
                  {w.sessions}
                </text>
              )}
              {(i === 0 || last) && (
                <text class="chart-label" x={x + barW / 2} y={H - 6} text-anchor="middle">
                  {last ? "This week" : shortDate(w.start)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption class="small muted">Sessions each week</figcaption>
      <table class="sr-only">
        <caption>Sessions each week</caption>
        <tr>
          <th scope="col">Week of</th>
          <th scope="col">Sessions</th>
          <th scope="col">Minutes</th>
        </tr>
        {props.weeks.map((w) => (
          <tr>
            <td>{shortDate(w.start)}</td>
            <td>{w.sessions}</td>
            <td>{w.minutes}</td>
          </tr>
        ))}
      </table>
    </figure>
  );
}

function Stat(props: { value: string; label: string }) {
  return (
    <div class="stat">
      <p class="stat-value">{props.value}</p>
      <p class="stat-label">{props.label}</p>
    </div>
  );
}

/** The employee's dashboard: today's session, their numbers, their courses and the meal planner. */
export function TeamDashboardPage(props: { meta: PageMeta; csrfToken: string; name: string | null; d: TeamDashboard; session: TeamSession; done?: boolean; needWordsConsent?: boolean }) {
  const { d, session } = props;
  const doneToday = d.doneToday.includes(session.id);
  const thisWeek = d.weeks[d.weeks.length - 1]!;
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap">
          <p class="eyebrow">Your wellbeing dashboard</p>
          <h1>{props.name ? `Hello, ${props.name.split(" ")[0]}` : "Hello"}</h1>
          <p class="lede">A few minutes a day. Here's today, and how you're getting on.</p>
        </div>
      </section>

      <section class="band band-tight">
        <div class="wrap team-grid">
          <article class="card team-today" id="today">
            <p class="eyebrow">Today's session · {session.minutes} min</p>
            <h2>{session.title}</h2>
            <p>{session.intro}</p>
            <ol class="method">
              {session.steps.map((s) => (
                <li>{s}</li>
              ))}
            </ol>
            <p class="small">
              <strong>Watch for:</strong> {session.watch}
            </p>
            {doneToday ? (
              <p class="notice notice-ok" role="status">
                Done for today. Nicely done.
              </p>
            ) : (
              <form method="post" action="/account/team/done">
                <CsrfField token={props.csrfToken} />
                <input type="hidden" name="session" value={session.id} />
                <button class="btn btn-primary" type="submit">
                  I've done it
                </button>
              </form>
            )}
            <p class="small muted">{TEAM_SAFETY}</p>
          </article>

          <article class="card team-stats">
            <h2 class="h3">How you're getting on</h2>
            <div class="stats">
              <Stat value={String(d.streak)} label={d.streak === 1 ? "day in a row" : "days in a row"} />
              <Stat value={String(thisWeek.sessions)} label="sessions this week" />
              <Stat value={String(d.totalMinutes)} label="minutes in total" />
            </div>
            <WeeklyChart weeks={d.weeks} />
          </article>

          <ThoughtCard csrfToken={props.csrfToken} today={d.today} tradition={d.tradition} needConsent={props.needWordsConsent} />

          <MoodCard csrfToken={props.csrfToken} today={d.today} mood={d.moods[d.today] ?? null} moods={d.moods} />

          <TodayPlans plans={d.todayPlans} csrfToken={props.csrfToken} />

          <article class="card">
            <h2 class="h3">Your courses</h2>
            {d.programmes.length === 0 ? (
              <p class="small muted">Courses your workplace has given you will appear here.</p>
            ) : (
              <ul class="team-courses">
                {d.programmes.map((p) => (
                  <li>
                    <a href={`/account/programmes/${p.slug}`}>{p.title}</a>
                    {p.lessons > 0 && (
                      <>
                        <span class="small muted">
                          {" "}
                          {p.done} of {p.lessons}
                        </span>
                        <div class="progress" role="img" aria-label={`${p.done} of ${p.lessons} done`}>
                          <span class={`progress-bar w-${Math.round((p.done / p.lessons) * 20) * 5}`} />
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article class="card">
            <h2 class="h3">Meal planner</h2>
            <p>A week of meals for your budget and household, with the recipes and a shopping list.</p>
            {d.meals && d.meals.weeks > 0 && d.meals.savedPence > 0 && <p class="small">You've logged {d.meals.weeks} weeks of shopping so far.</p>}
            <Button href="/account/meal-plans">Open the meal planner</Button>
          </article>
        </div>
      </section>
    </Layout>
  );
}
