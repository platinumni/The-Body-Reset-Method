// Anonymous counters: how many times pages were viewed and shop steps happened, per day.
// No cookies, no IP addresses, nothing that identifies a person.

export type Metric = "view" | "add_to_basket" | "checkout_started" | "purchase";

const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|headless|lighthouse/i;
export const isBot = (userAgent: string | undefined) => !userAgent || BOT.test(userAgent);

export async function recordStat(db: D1Database, metric: Metric, path = "", now = new Date()): Promise<void> {
  await db
    .prepare("INSERT INTO daily_stats (day, metric, path, count) VALUES (?1, ?2, ?3, 1) ON CONFLICT (day, metric, path) DO UPDATE SET count = count + 1")
    .bind(now.toISOString().slice(0, 10), metric, path.slice(0, 200))
    .run();
}

export type StatsSummary = {
  days: { day: string; views: number }[];
  topPages: { path: string; views: number }[];
  funnel: Record<Metric, number>;
};

export async function statsSummary(db: D1Database, days = 30): Promise<StatsSummary> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const daily = (
    await db.prepare("SELECT day, SUM(count) AS views FROM daily_stats WHERE metric = 'view' AND day >= ?1 GROUP BY day ORDER BY day").bind(since).all<{ day: string; views: number }>()
  ).results;
  const top = (
    await db
      .prepare("SELECT path, SUM(count) AS views FROM daily_stats WHERE metric = 'view' AND day >= ?1 GROUP BY path ORDER BY views DESC LIMIT 15")
      .bind(since)
      .all<{ path: string; views: number }>()
  ).results;
  const funnelRows = (await db.prepare("SELECT metric, SUM(count) AS n FROM daily_stats WHERE day >= ?1 GROUP BY metric").bind(since).all<{ metric: Metric; n: number }>()).results;
  const funnel = { view: 0, add_to_basket: 0, checkout_started: 0, purchase: 0 } as Record<Metric, number>;
  for (const r of funnelRows) funnel[r.metric] = r.n;
  // Fill in days with no visits so the chart has no gaps.
  const byDay = new Map(daily.map((d) => [d.day, d.views]));
  const filled = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day, views: byDay.get(day) ?? 0 };
  });
  return { days: filled, topPages: top, funnel };
}
