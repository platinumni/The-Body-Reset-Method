#!/usr/bin/env node
// Fetches the latest official average food prices and writes content/meal-plans/official-prices.json,
// which the meal planner uses (bundled with the website). Run monthly, or let the website's own
// monthly refresh do it. Sources and conversions: content/meal-plans/official-sources.json.
//
//   node scripts/fetch-official-prices.mjs            (BLS_API_KEY optional, for US prices)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "content", "meal-plans");
const SRC = JSON.parse(readFileSync(join(DIR, "official-sources.json"), "utf8"));
const OUT = join(DIR, "official-prices.json");
const round = (n) => Math.round(n * 100) / 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (p) => {
  const m = /^(\d{4}) ([A-Z]{3})$/.exec(p ?? "");
  const i = m ? MONTHS.findIndex((x) => x.slice(0, 3).toUpperCase() === m[2]) : -1;
  return i >= 0 ? `${MONTHS[i]} ${m[1]}` : p;
};

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const onsSeries = async (cdid) => (await getJson(`https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/${cdid}/mm23/data`)).months ?? [];
const valueAt = (months, period) => Number(months.find((m) => m.date === period)?.value);

export async function fetchUk() {
  // Real shop prices from ONS (January 2026, the last month of published food quotes), by region,
  // brought up to date with the CPI food index. Rebuild the quotes with scripts/build-ons-quotes.mjs.
  const uk = SRC.uk;
  const quotes = JSON.parse(readFileSync(join(DIR, "ons-price-quotes.json"), "utf8"));
  const index = await onsSeries(uk.index.cdid);
  const latest = index[index.length - 1];
  const scale = Number(latest.value) / valueAt(index, uk.quotes.period);
  const regions = { national: {} };
  for (const m of uk.quotes.items) {
    const q = quotes.items[m.id];
    if (!q) continue;
    regions.national[m.key] = round(q.national * m.factor * scale);
    for (const [region, price] of Object.entries(q.regions)) (regions[region] ??= {})[m.key] = round(price * m.factor * scale);
  }
  return {
    source: uk.source,
    period: latest.date,
    note: `Real shop prices recorded by ONS in ${monthName(uk.quotes.period)}, brought up to ${monthName(latest.date)} with the official food price index`,
    estimateAdjust: round(Number(latest.value) / valueAt(index, uk.estimatesIndexPeriod) * 1000) / 1000,
    regions,
  };
}

export async function fetchCa() {
  const ca = SRC.ca;
  const wanted = ca.products.flatMap((p) => Object.entries(p.vectors).map(([geo, vectorId]) => ({ geo, vectorId, p })));
  const regions = {};
  let period = null;
  for (let i = 0; i < wanted.length; i += 100) {
    const batch = wanted.slice(i, i + 100);
    const res = await getJson("https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((w) => ({ vectorId: w.vectorId, latestN: 1 }))),
    });
    for (const r of res) {
      const point = r.object?.vectorDataPoint?.[0];
      // Responses don't always come back in the order asked, so match on the vector id.
      const w = batch.find((x) => x.vectorId === r.object?.vectorId);
      if (r.status !== "SUCCESS" || !point || point.value == null || !w) continue;
      const region = w.geo === "Canada" ? "national" : w.geo;
      (regions[region] ??= {})[w.p.key] = round(Number(point.value) * w.p.factor);
      if (!period || point.refPer > period) period = point.refPer;
    }
  }
  return { source: ca.source, period, note: "Monthly average retail prices, national and by province", estimateAdjust: 1, regions };
}

export async function fetchUs() {
  const us = SRC.us;
  const ids = [];
  for (const [region, code] of Object.entries(us.regions)) for (const s of us.series) ids.push({ id: `APU${code}${s.item}`, region, s });
  const regions = {};
  let period = null;
  const key = process.env.BLS_API_KEY;
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const res = await getJson(`https://api.bls.gov/publicAPI/${key ? "v2" : "v1"}/timeseries/data/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesid: batch.map((b) => b.id), ...(key ? { registrationkey: key } : {}) }),
    });
    if (res.status !== "REQUEST_SUCCEEDED") throw new Error(`BLS: ${(res.message ?? []).join(" ")}`);
    for (const series of res.Results?.series ?? []) {
      const b = batch.find((x) => x.id === series.seriesID);
      const latest = series.data?.[0];
      if (!b || !latest) continue;
      (regions[b.region] ??= {})[b.s.key] = round(Number(latest.value) * b.s.factor);
      const p = `${latest.year}-${latest.period.replace("M", "")}`;
      if (!period || p > period) period = p;
    }
  }
  return { source: us.source, period, note: "Average prices, US city average and by region", estimateAdjust: 1, regions };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const out = { fetchedAt: new Date().toISOString() };
  for (const [country, fn] of [["uk", fetchUk], ["us", fetchUs], ["ca", fetchCa]]) {
    try {
      out[country] = await fn();
      const n = Object.values(out[country].regions).reduce((t, r) => t + Object.keys(r).length, 0);
      console.log(`✓ ${country}: ${n} prices, period ${out[country].period}`);
    } catch (err) {
      out[country] = previous[country] ?? null;
      console.error(`✗ ${country}: ${err.message}${previous[country] ? " (kept last month's prices)" : ""}`);
    }
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
}
