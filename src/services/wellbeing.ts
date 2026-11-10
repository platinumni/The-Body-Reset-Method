// Team wellbeing, stage 2: a private mood check-in, a private (encrypted) diary, and a simple planner.
// Everything here is the employee's own. Employers never see it, not even as totals.

import { decryptText, encryptText } from "../lib/encryption";

export const MOODS: { value: number; label: string }[] = [
  { value: 1, label: "Struggling" },
  { value: 2, label: "Low" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Great" },
];

export const PLAN_KINDS = { session: "Daily session", course: "Course", meal: "Meal or cooking", other: "Something else" } as const;
export type PlanKind = keyof typeof PLAN_KINDS;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string) => DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// --- Mood check-in ---

export async function checkIn(db: D1Database, userId: number, day: string, mood: number): Promise<boolean> {
  if (!validDay(day) || !MOODS.some((m) => m.value === mood)) return false;
  await db.prepare("INSERT INTO wellbeing_checkins (user_id, day, mood) VALUES (?1, ?2, ?3) ON CONFLICT (user_id, day) DO UPDATE SET mood = excluded.mood").bind(userId, day, mood).run();
  return true;
}

export async function moods(db: D1Database, userId: number, from: string, to: string): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT day, mood FROM wellbeing_checkins WHERE user_id = ?1 AND day BETWEEN ?2 AND ?3").bind(userId, from, to).all<{ day: string; mood: number }>();
  return Object.fromEntries(results.map((r) => [r.day, r.mood]));
}

// --- Diary (encrypted) ---

export const DIARY_MAX = 4000;
export type DiaryEntry = { id: number; day: string; body: string; created_at: string };

export async function addDiary(env: Env, userId: number, day: string, body: string): Promise<"saved" | "empty" | "unavailable"> {
  const text = body.trim().slice(0, DIARY_MAX);
  if (!text || !validDay(day)) return "empty";
  if (!env.ADMIN_ENC_KEY) return "unavailable";
  await env.DB.prepare("INSERT INTO wellbeing_diary (user_id, day, body_enc) VALUES (?1, ?2, ?3)").bind(userId, day, await encryptText(env.ADMIN_ENC_KEY, text)).run();
  return "saved";
}

export async function deleteDiary(db: D1Database, userId: number, id: number): Promise<void> {
  await db.prepare("DELETE FROM wellbeing_diary WHERE id = ?1 AND user_id = ?2").bind(id, userId).run();
}

export async function listDiary(env: Env, userId: number, limit = 30): Promise<DiaryEntry[]> {
  if (!env.ADMIN_ENC_KEY) return [];
  const { results } = await env.DB.prepare("SELECT id, day, body_enc, created_at FROM wellbeing_diary WHERE user_id = ?1 ORDER BY day DESC, id DESC LIMIT ?2").bind(userId, limit).all<{ id: number; day: string; body_enc: string; created_at: string }>();
  const out: DiaryEntry[] = [];
  for (const r of results) {
    try {
      out.push({ id: r.id, day: r.day, body: await decryptText(env.ADMIN_ENC_KEY, r.body_enc), created_at: r.created_at });
    } catch {
      out.push({ id: r.id, day: r.day, body: "(This entry can't be read.)", created_at: r.created_at });
    }
  }
  return out;
}

// --- Planner ---

export type Plan = { id: number; day: string; time: string | null; kind: PlanKind; title: string; done_at: string | null };

export function planProblem(i: { day: string; time: string; kind: string; title: string }): string | null {
  if (!validDay(i.day)) return "Choose a date.";
  if (i.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(i.time)) return "Choose a time, or leave it empty.";
  if (!(i.kind in PLAN_KINDS)) return "Choose what it is.";
  if (!i.title.trim()) return "Say what you're planning.";
  return null;
}

export async function addPlan(db: D1Database, userId: number, i: { day: string; time: string; kind: string; title: string }): Promise<string | null> {
  const problem = planProblem(i);
  if (problem) return problem;
  const count = await db.prepare("SELECT COUNT(*) AS n FROM wellbeing_plans WHERE user_id = ?1 AND day = ?2").bind(userId, i.day).first<number>("n");
  if ((count ?? 0) >= 20) return "That day is full: 20 plans at most.";
  await db.prepare("INSERT INTO wellbeing_plans (user_id, day, time, kind, title) VALUES (?1, ?2, ?3, ?4, ?5)").bind(userId, i.day, i.time || null, i.kind, i.title.trim().slice(0, 120)).run();
  return null;
}

export async function setPlanDone(db: D1Database, userId: number, id: number, done: boolean): Promise<void> {
  await db.prepare("UPDATE wellbeing_plans SET done_at = CASE WHEN ?3 THEN datetime('now') ELSE NULL END WHERE id = ?1 AND user_id = ?2").bind(id, userId, done ? 1 : 0).run();
}

export async function deletePlan(db: D1Database, userId: number, id: number): Promise<void> {
  await db.prepare("DELETE FROM wellbeing_plans WHERE id = ?1 AND user_id = ?2").bind(id, userId).run();
}

export async function plansBetween(db: D1Database, userId: number, from: string, to: string): Promise<Plan[]> {
  const { results } = await db
    .prepare("SELECT id, day, time, kind, title, done_at FROM wellbeing_plans WHERE user_id = ?1 AND day BETWEEN ?2 AND ?3 ORDER BY day, time IS NULL, time, id")
    .bind(userId, from, to)
    .all<Plan>();
  return results;
}

export async function sessionsBetween(db: D1Database, userId: number, from: string, to: string): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT day, COUNT(*) AS n FROM wellbeing_activity WHERE user_id = ?1 AND day BETWEEN ?2 AND ?3 GROUP BY day").bind(userId, from, to).all<{ day: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.day, r.n]));
}

export { validDay };

// --- UK GDPR ---

export async function wellbeingDataFor(env: Env, userId: number): Promise<Record<string, unknown>> {
  const q = async (sql: string) => (await env.DB.prepare(sql).bind(userId).all()).results;
  return {
    moodCheckIns: await q("SELECT day, mood, created_at FROM wellbeing_checkins WHERE user_id = ?1 ORDER BY day"),
    diary: (await listDiary(env, userId, 10_000)).map((d) => ({ day: d.day, text: d.body, created_at: d.created_at })),
    plans: await q("SELECT day, time, kind, title, done_at, created_at FROM wellbeing_plans WHERE user_id = ?1 ORDER BY day, id"),
  };
}

export const WELLBEING_DELETES = ["DELETE FROM wellbeing_checkins WHERE user_id = ?1", "DELETE FROM wellbeing_diary WHERE user_id = ?1", "DELETE FROM wellbeing_plans WHERE user_id = ?1"];
