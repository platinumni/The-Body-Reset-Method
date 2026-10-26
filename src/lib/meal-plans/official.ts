// Official average food prices: which ones we have, and how to fetch fresh ones.
// Sources and unit conversions live in content/meal-plans/official-sources.json.
// A copy fetched at build time is bundled (official-prices.json); the website refreshes it monthly.

import bundled from "../../../content/meal-plans/official-prices.json";
import sources from "../../../content/meal-plans/official-sources.json";
import type { Country } from "./planner";

export type CountryPrices = { source: string; period: string | null; note: string; estimateAdjust: number; regions: Record<string, Record<string, number>> };
export type OfficialPrices = { fetchedAt: string; uk?: CountryPrices | null; us?: CountryPrices | null; ca?: CountryPrices | null };

export const BUNDLED_PRICES = bundled as unknown as OfficialPrices;

/** What the planner needs for one country and region. */
export type PriceBook = { official: Record<string, number>; estimateAdjust: number; source: string | null; period: string | null; note: string | null; region: string };

export function priceBook(prices: OfficialPrices, country: Country, region = "national"): PriceBook {
  const c = prices[country];
  if (!c) return { official: {}, estimateAdjust: 1, source: null, period: null, note: null, region: "national" };
  const regional = region !== "national" && c.regions[region] ? region : "national";
  return {
    official: { ...(c.regions.national ?? {}), ...(regional !== "national" ? c.regions[regional] : {}) },
    estimateAdjust: c.estimateAdjust || 1,
    source: c.source,
    period: c.period,
    note: c.note,
    region: regional,
  };
}

/** Regions people can pick, per country. */
export function regionsFor(prices: OfficialPrices, country: Country): string[] {
  if (country === "us") return Object.keys(sources.us.regions).filter((r) => r !== "national");
  const c = prices[country];
  return c ? Object.keys(c.regions).filter((r) => r !== "national").sort() : [];
}

export const REGION_LABELS: Record<string, string> = { northeast: "Northeast", midwest: "Midwest", south: "South", west: "West" };

const round = (n: number) => Math.round(n * 100) / 100;

async function getJson(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<any> {
  const res = await fetcher(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

type OnsMonth = { date: string; value: string };
const valueAt = (months: OnsMonth[], period: string) => Number(months.find((m) => m.date === period)?.value);

/** UK: ONS average prices (last published January 2025), brought up to date with the official food price index. */
export async function fetchUk(fetcher: typeof fetch = fetch): Promise<CountryPrices> {
  const uk = sources.uk;
  const series = async (cdid: string): Promise<OnsMonth[]> => (await getJson(fetcher, `https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/${cdid}/mm23/data`)).months ?? [];
  const index = await series(uk.index.cdid);
  const latest = index[index.length - 1]!;
  const scale = Number(latest.value) / valueAt(index, uk.basePeriod);
  const prices: Record<string, number> = {};
  for (const s of uk.series) {
    const v = valueAt(await series(s.cdid), uk.basePeriod);
    if (Number.isFinite(v)) prices[s.key] = round((v / 100) * s.factor * scale);
  }
  return {
    source: uk.source,
    period: latest.date,
    note: `Average prices from ${uk.basePeriod.toLowerCase()} brought up to ${latest.date.toLowerCase()} with the official food price index`,
    estimateAdjust: Math.round((Number(latest.value) / valueAt(index, uk.estimatesIndexPeriod)) * 1000) / 1000,
    regions: { national: prices },
  };
}

/** Canada: Statistics Canada monthly average retail prices, national and by province. */
export async function fetchCa(fetcher: typeof fetch = fetch): Promise<CountryPrices> {
  const wanted = sources.ca.products.flatMap((p) => Object.entries(p.vectors as Record<string, number>).map(([geo, vectorId]) => ({ geo, vectorId, p })));
  const regions: Record<string, Record<string, number>> = {};
  let period: string | null = null;
  for (let i = 0; i < wanted.length; i += 100) {
    const batch = wanted.slice(i, i + 100);
    const res: any[] = await getJson(fetcher, "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((w) => ({ vectorId: w.vectorId, latestN: 1 }))),
    });
    for (const r of res) {
      const point = r.object?.vectorDataPoint?.[0];
      const w = batch.find((x) => x.vectorId === r.object?.vectorId);
      if (r.status !== "SUCCESS" || !point || point.value == null || !w) continue;
      const region = w.geo === "Canada" ? "national" : w.geo;
      (regions[region] ??= {})[w.p.key] = round(Number(point.value) * w.p.factor);
      if (!period || point.refPer > period) period = point.refPer;
    }
  }
  return { source: sources.ca.source, period, note: "Monthly average retail prices, national and by province", estimateAdjust: 1, regions };
}

/** US: Bureau of Labor Statistics average prices, national and 4 regions. A free key (BLS_API_KEY) raises the daily limit. */
export async function fetchUs(fetcher: typeof fetch = fetch, key?: string): Promise<CountryPrices> {
  const ids = Object.entries(sources.us.regions).flatMap(([region, code]) => sources.us.series.map((s) => ({ id: `APU${code}${s.item}`, region, s })));
  const regions: Record<string, Record<string, number>> = {};
  let period: string | null = null;
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const res = await getJson(fetcher, `https://api.bls.gov/publicAPI/${key ? "v2" : "v1"}/timeseries/data/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesid: batch.map((b) => b.id), ...(key ? { registrationkey: key } : {}) }),
    });
    if (res.status !== "REQUEST_SUCCEEDED") throw new Error(`BLS: ${(res.message ?? []).join(" ")}`);
    for (const s of res.Results?.series ?? []) {
      const b = batch.find((x) => x.id === s.seriesID);
      const latest = s.data?.[0];
      if (!b || !latest) continue;
      (regions[b.region] ??= {})[b.s.key] = round(Number(latest.value) * b.s.factor);
      const p = `${latest.year}-${String(latest.period).replace("M", "")}`;
      if (!period || p > period) period = p;
    }
  }
  return { source: sources.us.source, period, note: "Average prices, US city average and by region", estimateAdjust: 1, regions };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026 SEP", "2026-08-01" or "2026-09" as "September 2026". */
export function formatPeriod(period: string | null): string {
  if (!period) return "";
  let m = /^(\d{4}) ([A-Z]{3})$/.exec(period);
  if (m) {
    const i = MONTHS.findIndex((x) => x.slice(0, 3).toUpperCase() === m![2]);
    return i >= 0 ? `${MONTHS[i]} ${m[1]}` : period;
  }
  m = /^(\d{4})-(\d{2})/.exec(period);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : period;
}
