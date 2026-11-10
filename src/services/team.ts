// Team wellbeing (business package): who can use the employee dashboard, and what goes on it.
// Everything here is about one employee's own data. Employers never see it, only totals (stage 4).

import { teamSessionById } from "../content/team-sessions";
import { listOwnedProgrammes, ownedProgrammeBySlug, type OwnedProgramme } from "./library";
import { spendSummary, type SpendSummary } from "./meal-plans";
import { moods, plansBetween, type Plan } from "./wellbeing";

export const TEAM_SLUG = "teams";

export const canUseTeam = async (db: D1Database, userId: number) => !!(await ownedProgrammeBySlug(db, userId, TEAM_SLUG));

/** Today's date in the UK (YYYY-MM-DD), so "today" matches the employee's own day. */
export function ukDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Mark today's (or any listed) session done. Once per session per day. */
export async function logSession(db: D1Database, userId: number, sessionId: string, day = ukDay()): Promise<boolean> {
  const s = teamSessionById(sessionId);
  if (!s) return false;
  await db.prepare("INSERT INTO wellbeing_activity (user_id, kind, ref, minutes, day) VALUES (?1, 'session', ?2, ?3, ?4) ON CONFLICT DO NOTHING").bind(userId, s.id, s.minutes, day).run();
  return true;
}

export type WeekBar = { start: string; sessions: number; minutes: number };

export type TeamDashboard = {
  today: string;
  doneToday: string[];
  weeks: WeekBar[];
  streak: number;
  totalSessions: number;
  totalMinutes: number;
  programmes: OwnedProgramme[];
  meals: SpendSummary | null;
  /** Mood check-ins for the last 14 days (day → 1-5), and today's plans. */
  moods: Record<string, number>;
  todayPlans: Plan[];
};

/** Monday of the week a day falls in. */
export function weekStart(day: string): string {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

/** Days in a row with at least one session, counting back from today (or yesterday, if today isn't done yet). */
export function streakFrom(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export async function teamDashboard(db: D1Database, userId: number, today = ukDay(), weeksShown = 8): Promise<TeamDashboard> {
  const from = addDays(weekStart(today), -7 * (weeksShown - 1));
  const { results } = await db
    .prepare("SELECT ref, minutes, day FROM wellbeing_activity WHERE user_id = ?1 AND day >= ?2 ORDER BY day")
    .bind(userId, addDays(today, -400)) // a year and a bit, for the streak
    .all<{ ref: string; minutes: number; day: string }>();
  const weeks: WeekBar[] = Array.from({ length: weeksShown }, (_, i) => ({ start: addDays(from, 7 * i), sessions: 0, minutes: 0 }));
  for (const r of results) {
    const w = weeks.find((x) => x.start === weekStart(r.day));
    if (w) {
      w.sessions++;
      w.minutes += r.minutes;
    }
  }
  const totals = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(minutes), 0) AS m FROM wellbeing_activity WHERE user_id = ?1").bind(userId).first<{ n: number; m: number }>();
  const programmes = (await listOwnedProgrammes(db, userId)).filter((p) => p.slug !== TEAM_SLUG && p.slug !== "meal-plans");
  const hasMeals = !!(await ownedProgrammeBySlug(db, userId, "meal-plans"));
  return {
    today,
    doneToday: results.filter((r) => r.day === today).map((r) => r.ref),
    weeks,
    streak: streakFrom(new Set(results.map((r) => r.day)), today),
    totalSessions: totals?.n ?? 0,
    totalMinutes: totals?.m ?? 0,
    programmes,
    meals: hasMeals ? await spendSummary(db, userId) : null,
    moods: await moods(db, userId, addDays(today, -13), today),
    todayPlans: await plansBetween(db, userId, today, today),
  };
}

/** For the employee's data export. */
export async function teamDataFor(db: D1Database, userId: number): Promise<Record<string, unknown>> {
  return { wellbeingSessions: (await db.prepare("SELECT ref, minutes, day, created_at FROM wellbeing_activity WHERE user_id = ?1 ORDER BY id").bind(userId).all()).results };
}
