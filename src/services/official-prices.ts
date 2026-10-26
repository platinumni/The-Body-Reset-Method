// Keeps the meal planner's official food prices fresh: the website refreshes them itself
// about once a month (daily job), storing the result in settings. A copy bundled with the
// website is used until the first refresh.

import { BUNDLED_PRICES, fetchCa, fetchUk, fetchUs, type OfficialPrices } from "../lib/meal-plans/official";

const KEY = "meal.official_prices";
const REFRESH_DAYS = 25;

export async function loadOfficialPrices(db: D1Database): Promise<OfficialPrices> {
  const raw = await db.prepare("SELECT value FROM settings WHERE key = ?1").bind(KEY).first<string>("value");
  if (!raw) return BUNDLED_PRICES;
  try {
    const stored = JSON.parse(raw) as OfficialPrices;
    return stored.fetchedAt > BUNDLED_PRICES.fetchedAt ? stored : BUNDLED_PRICES;
  } catch {
    return BUNDLED_PRICES;
  }
}

/** Fetches every country it can. A country that fails keeps its previous prices. */
export async function refreshOfficialPrices(env: Env, fetcher: typeof fetch = fetch, force = false): Promise<Record<string, string>> {
  const current = await loadOfficialPrices(env.DB);
  const ageDays = (Date.now() - Date.parse(current.fetchedAt)) / 86_400_000;
  if (!force && ageDays < REFRESH_DAYS) return { skipped: `prices are ${Math.floor(ageDays)} days old` };
  const next: OfficialPrices = { ...current, fetchedAt: new Date().toISOString() };
  const result: Record<string, string> = {};
  const blsKey = (env as unknown as { BLS_API_KEY?: string }).BLS_API_KEY;
  for (const [country, run] of [
    ["uk", () => fetchUk(fetcher)],
    ["us", () => fetchUs(fetcher, blsKey)],
    ["ca", () => fetchCa(fetcher)],
  ] as const) {
    try {
      next[country] = await run();
      result[country] = `updated to ${next[country]!.period}`;
    } catch (err) {
      result[country] = `kept previous (${String(err).slice(0, 120)})`;
    }
  }
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
    .bind(KEY, JSON.stringify(next))
    .run();
  return result;
}
