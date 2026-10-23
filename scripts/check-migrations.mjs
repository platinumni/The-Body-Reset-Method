#!/usr/bin/env node
// Migration safety check — protects live data.
//
//   node scripts/check-migrations.mjs          check (runs inside `npm run check`)
//   node scripts/check-migrations.mjs --lock   record new migration files in migrations.lock.json
//
// Rules:
//   1. Files are named NNNN_lower_snake.sql, numbered 0001, 0002, ... with no gaps.
//   2. A file recorded in the lock can never be edited or deleted (hash must match).
//   3. Every file must be in the lock (run --lock after adding a new one).
//   4. No destructive SQL: DROP, DELETE, TRUNCATE, RENAME, REPLACE INTO.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv.find((a) => a.startsWith("--dir="))?.slice(6) ?? "migrations";
const lockPath = join(dir, "..", "migrations.lock.json");
const lockMode = process.argv.includes("--lock");

const FORBIDDEN = [
  [/\bDROP\s+(TABLE|COLUMN|INDEX|VIEW|TRIGGER)\b/i, "DROP"],
  [/\bDELETE\s+FROM\b/i, "DELETE FROM"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\bRENAME\s+(TO|COLUMN)\b/i, "RENAME"],
  [/\b(INSERT\s+OR\s+REPLACE|REPLACE\s+INTO)\b/i, "REPLACE INTO"],
];

/** Strip SQL comments so words in comments don't trip the scan. */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

export function checkMigrations({ files, lock }) {
  const errors = [];
  const names = files.map((f) => f.name).sort();

  names.forEach((name, i) => {
    const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name);
    if (!m) errors.push(`${name}: name must look like 0002_add_orders.sql`);
    else if (Number(m[1]) !== i + 1) errors.push(`${name}: expected number ${String(i + 1).padStart(4, "0")} (no gaps or duplicates)`);
  });

  for (const [name, hash] of Object.entries(lock)) {
    const file = files.find((f) => f.name === name);
    if (!file) errors.push(`${name}: locked migration was deleted — restore it`);
    else if (file.hash !== hash) errors.push(`${name}: locked migration was edited — revert it and add a new migration instead`);
  }

  for (const file of files) {
    if (!(file.name in lock) && !lockMode) errors.push(`${file.name}: not in migrations.lock.json — run "npm run migrations:lock"`);
    const sql = stripComments(file.sql);
    for (const [re, label] of FORBIDDEN) {
      if (re.test(sql)) errors.push(`${file.name}: contains ${label} — migrations must be add-only`);
    }
  }
  return errors;
}

function main() {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n.endsWith(".sql"))
        .map((name) => {
          const sql = readFileSync(join(dir, name), "utf8");
          return { name, sql, hash: createHash("sha256").update(sql).digest("hex") };
        })
    : [];
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};
  const errors = checkMigrations({ files, lock });

  if (errors.length) {
    console.error("✗ Migration check failed:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  if (lockMode) {
    const next = Object.fromEntries(files.sort((a, b) => a.name.localeCompare(b.name)).map((f) => [f.name, f.hash]));
    writeFileSync(lockPath, JSON.stringify(next, null, 2) + "\n");
    console.log(`✓ Locked ${files.length} migration(s).`);
  } else {
    console.log(`✓ ${files.length} migration(s) OK (add-only, unedited, numbered).`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
