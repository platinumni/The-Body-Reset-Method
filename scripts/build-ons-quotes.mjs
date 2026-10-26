#!/usr/bin/env node
// Builds real average UK shop prices from the ONS price-quotes file (the individual prices
// ONS collectors record in shops each month for inflation figures), national and by region.
// January 2026 is the last month ONS published supermarket food quotes; since then food prices
// come from supermarket till data, which isn't published item by item. The website brings
// these prices up to date each month with the official CPI food index.
//
//   node scripts/build-ons-quotes.mjs path/to/upload-pricequotes202601.csv
//
// Writes content/meal-plans/ons-price-quotes.json. Uses the median (typical) price per item,
// ignoring quotes ONS marked invalid. A region is only included with at least MIN_REGION quotes.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "content", "meal-plans", "ons-price-quotes.json");
export const MIN_REGION = 8;

// ONS price-quote region codes.
export const ONS_REGIONS = {
  2: "London",
  3: "South East",
  4: "South West",
  5: "East Anglia",
  6: "East Midlands",
  7: "West Midlands",
  8: "Yorkshire and the Humber",
  9: "North West",
  10: "North East",
  11: "Wales",
  12: "Scotland",
  13: "Northern Ireland",
};

/** Minimal CSV line parser (handles quoted fields with commas). */
export function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const round = (n) => Math.round(n * 100) / 100;

/** From the CSV text, the typical price of each food item, nationally and by region. */
export function summarise(csv, wantedIds) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines[0]);
  const col = (name) => head.indexOf(name);
  const [iDate, iItem, iDesc, iValid, iPrice, iRegion] = ["QUOTE_DATE", "ITEM_ID", "ITEM_DESC", "VALIDITY", "PRICE", "REGION"].map(col);
  if (iItem < 0) throw new Error("This file has no ITEM_ID column (ONS stopped publishing food quotes after January 2026).");
  const prices = new Map();
  let period = null;
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    if (!wantedIds.has(f[iItem]) || String(f[iValid]).toUpperCase() !== "TRUE") continue;
    const price = Number(f[iPrice]);
    if (!(price > 0)) continue;
    period ??= f[iDate];
    const e = prices.get(f[iItem]) ?? { desc: f[iDesc], all: [], regions: {} };
    e.all.push(price);
    (e.regions[f[iRegion]] ??= []).push(price);
    prices.set(f[iItem], e);
  }
  const items = {};
  for (const [id, e] of prices) {
    const regions = {};
    for (const [code, xs] of Object.entries(e.regions)) if (ONS_REGIONS[code] && xs.length >= MIN_REGION) regions[ONS_REGIONS[code]] = round(median(xs));
    items[id] = { desc: e.desc, quotes: e.all.length, national: round(median(e.all)), regions };
  }
  return { period, items };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node scripts/build-ons-quotes.mjs upload-pricequotesYYYYMM.csv");
  const sources = JSON.parse(readFileSync(join(ROOT, "content", "meal-plans", "official-sources.json"), "utf8"));
  const wanted = new Set(sources.uk.quotes.items.map((i) => i.id));
  const { period, items } = summarise(readFileSync(file, "latin1"), wanted);
  const missing = [...wanted].filter((id) => !items[id]);
  writeFileSync(OUT, JSON.stringify({ source: "Office for National Statistics (ONS) consumer price quotes", period, items }, null, 1) + "\n");
  console.log(`✓ ${Object.keys(items).length} items for ${period}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
}
