// Budget meal plans: who can use them, and each member's saved choices.
// The plan itself is worked out by src/lib/meal-plans/planner.ts (no database needed).

import { COUNTRIES, STORES, type Country, type Diet, type PlanInput, type Store } from "../lib/meal-plans/planner";
import { ALLERGEN_LABELS } from "../lib/meal-plans/recipes";
import { ownedProgrammeBySlug } from "./library";

export const MEAL_PLANS_SLUG = "meal-plans";

export const canUseMealPlans = async (db: D1Database, userId: number) => !!(await ownedProgrammeBySlug(db, userId, MEAL_PLANS_SLUG));

/** Choices that are remembered between visits (not the budget or which recipes were picked). */
export type MealPrefs = Pick<PlanInput, "country" | "store" | "adults" | "childAges" | "diet" | "exclude" | "avoidAllergens" | "snacks" | "have"> & { budget: number; usual: number | null };

export const DEFAULT_PREFS: MealPrefs = { budget: 40, country: "uk", store: "mid", adults: 1, childAges: [], diet: "any", exclude: [], avoidAllergens: [], snacks: true, have: [], usual: null };

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((s) => String(s).trim()).filter(Boolean);

/** Reads and cleans what the member chose, from a form or from saved settings. Never trusts the input. */
export function readPlanInput(src: Record<string, unknown>, fallback: MealPrefs = DEFAULT_PREFS): PlanInput {
  const country = (Object.keys(COUNTRIES) as Country[]).find((c) => c === src.country) ?? fallback.country;
  const store = (Object.keys(STORES) as Store[]).find((s) => s === src.store) ?? fallback.store;
  const diet = (["any", "pescatarian", "vegetarian", "vegan"] as Diet[]).find((d) => d === src.diet) ?? fallback.diet;
  const has = (k: string) => src[k] !== undefined;
  return {
    budget: clampInt(src.budget ?? fallback.budget, 10, 1000, fallback.budget),
    country,
    store,
    adults: clampInt(src.adults ?? fallback.adults, 1, 12, fallback.adults),
    childAges: (has("children") ? list(src.children) : fallback.childAges).map((a) => clampInt(a, 0, 17, 8)).slice(0, 10),
    diet,
    exclude: (has("exclude") ? list(src.exclude) : fallback.exclude).map((w) => w.slice(0, 40)).slice(0, 30),
    avoidAllergens: (has("allergens") ? list(src.allergens) : fallback.avoidAllergens).filter((a) => a in ALLERGEN_LABELS),
    snacks: has("submitted") ? src.snacks === "yes" : fallback.snacks,
    seed: clampInt(src.seed ?? 1, 1, 1_000_000, 1),
    have: (has("have") ? list(src.have) : fallback.have).slice(0, 200),
    picks: has("picks") ? list(src.picks).slice(0, 30) : undefined,
    usual: has("usual") ? (String(src.usual).trim() === "" ? null : clampInt(src.usual, 1, 5000, 0) || null) : fallback.usual,
  };
}

export async function loadPrefs(db: D1Database, userId: number): Promise<MealPrefs> {
  const row = await db.prepare("SELECT prefs_json FROM meal_plan_prefs WHERE user_id = ?1").bind(userId).first<string>("prefs_json");
  if (!row) return DEFAULT_PREFS;
  try {
    const saved = readPlanInput({ ...JSON.parse(row), submitted: "yes", snacks: JSON.parse(row).snacks ? "yes" : "no" });
    return { budget: saved.budget, country: saved.country, store: saved.store, adults: saved.adults, childAges: saved.childAges, diet: saved.diet, exclude: saved.exclude, avoidAllergens: [], snacks: saved.snacks, have: saved.have, usual: saved.usual ?? null };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(db: D1Database, userId: number, input: PlanInput): Promise<void> {
  // Allergies are health information, so they're never saved: members tick them each time.
  const prefs: MealPrefs = { budget: input.budget, country: input.country, store: input.store, adults: input.adults, childAges: input.childAges, diet: input.diet, exclude: input.exclude, avoidAllergens: [], snacks: input.snacks, have: input.have, usual: input.usual ?? null };
  await db
    .prepare("INSERT INTO meal_plan_prefs (user_id, prefs_json) VALUES (?1, ?2) ON CONFLICT (user_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = datetime('now')")
    .bind(userId, JSON.stringify(prefs))
    .run();
}

// --- What members actually spend ---

export type SpendSummary = { weeks: number; savedPence: number; currency: string; personalFactor: number };

/** Records one week: what the plan estimated, what they usually spend, and what they actually paid. */
export async function recordSpend(db: D1Database, userId: number, w: { plannedPence: number; usualPence: number | null; actualPence: number; currency: string }): Promise<void> {
  await db
    .prepare("INSERT INTO meal_plan_spend (user_id, planned_pence, usual_pence, actual_pence, currency) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(userId, w.plannedPence, w.usualPence, w.actualPence, w.currency)
    .run();
}

/** Their running savings (usual shop minus what they actually paid), and how their real prices compare with our estimates. */
export async function spendSummary(db: D1Database, userId: number): Promise<SpendSummary> {
  const { results } = await db
    .prepare("SELECT planned_pence, usual_pence, actual_pence, currency FROM meal_plan_spend WHERE user_id = ?1 ORDER BY id DESC LIMIT 200")
    .bind(userId)
    .all<{ planned_pence: number; usual_pence: number | null; actual_pence: number; currency: string }>();
  const currency = results[0]?.currency ?? "gbp";
  const same = results.filter((r) => r.currency === currency);
  const savedPence = same.reduce((t, r) => t + (r.usual_pence != null ? r.usual_pence - r.actual_pence : 0), 0);
  // Recent weeks only, and kept within sensible limits so one odd week can't skew future plans.
  const recent = same.slice(0, 4).filter((r) => r.planned_pence > 0);
  const ratio = recent.length ? recent.reduce((t, r) => t + r.actual_pence / r.planned_pence, 0) / recent.length : 1;
  return { weeks: same.length, savedPence, currency, personalFactor: Math.min(1.5, Math.max(0.7, ratio)) };
}

/** Anonymous totals across all members, for marketing figures. Real amounts paid only, never estimates. */
export async function memberSavingsSummary(db: D1Database): Promise<{ members: number; weeks: number; avgWeeklySavingPence: number | null }> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS members, COUNT(*) AS weeks, AVG(usual_pence - actual_pence) AS avg_saving
       FROM meal_plan_spend WHERE usual_pence IS NOT NULL AND currency = 'gbp'`,
    )
    .first<{ members: number; weeks: number; avg_saving: number | null }>();
  return { members: row?.members ?? 0, weeks: row?.weeks ?? 0, avgWeeklySavingPence: row?.avg_saving != null ? Math.round(row.avg_saving) : null };
}
