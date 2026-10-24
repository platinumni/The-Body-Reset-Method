#!/usr/bin/env node
// Import programme content from content/programmes/<slug>/*.md into a site's database.
//
//   node scripts/import-content.mjs staging [--update] [--dry-run]
//   node scripts/import-content.mjs production [--update]
//
// New sections are always added. Existing ones (same "key") are only changed with
// --update, and their previous version is saved to the history (undo) first.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "content", "programmes");

export function parseLessonFile(text, file = "file") {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n?/g, "\n"));
  if (!m) throw new Error(`${file}: missing --- front matter ---`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z_]+):\s*(.*?)\s*(#.*)?$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2];
  }
  const errors = [];
  if (!/^[a-z0-9-]{3,80}$/.test(meta.key ?? "")) errors.push("key must be lower-case letters, numbers and dashes");
  if (!["full", "quick"].includes(meta.tab)) errors.push("tab must be full or quick");
  if (!meta.title) errors.push("title is required");
  if (!["draft", "published", "archived"].includes(meta.status ?? "draft")) errors.push("status must be draft, published or archived");
  const kind = meta.kind || "section";
  if (!["section", "exercise"].includes(kind)) errors.push("kind must be section or exercise");
  const position = Number(meta.position ?? 0);
  if (!Number.isInteger(position)) errors.push("position must be a whole number");
  if (errors.length) throw new Error(`${file}: ${errors.join("; ")}`);
  const body = m[2].trim();
  const base = { key: meta.key, tab: meta.tab, position, title: meta.title, status: meta.status ?? "draft", youtube: youtubeId(meta.youtube), kind, stage: meta.stage || null, recommended_time: meta.recommended_time || null, sheet_line: meta.sheet_line || null };
  if (kind === "section") return { ...base, body, starting_position: null, conducting: null, watch_for: null, levels: null, key_points: null };
  // Exercises: the body is split into parts by these headings.
  const parts = splitParts(body);
  if (!parts.starting_position) throw new Error(`${file}: exercises need a "## Starting position" part`);
  return { ...base, body: "", ...parts };
}

const PART_HEADINGS = {
  "starting position": "starting_position",
  "conducting the exercise": "conducting",
  "what to watch for": "watch_for",
  "easier and harder versions": "levels",
  "key points": "key_points",
};

export function splitParts(body) {
  const out = { starting_position: null, conducting: null, watch_for: null, levels: null, key_points: null };
  let current = null;
  const buf = [];
  const flush = () => { if (current) out[current] = buf.join("\n").trim() || null; buf.length = 0; };
  for (const line of body.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    const part = h && PART_HEADINGS[h[1].toLowerCase()];
    if (part) { flush(); current = part; } else if (current) buf.push(line);
  }
  flush();
  return out;
}

export function youtubeId(input) {
  if (!input) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    const id = host === "youtu.be" ? u.pathname.slice(1).split("/")[0] : (u.searchParams.get("v") ?? /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(u.pathname)?.[1]);
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
  } catch {}
  throw new Error(`Not a YouTube link: ${input}`);
}

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

export function buildSql(slug, lessons, { update }) {
  const product = `(SELECT id FROM products WHERE slug = ${q(slug)})`;
  const out = [];
  for (const l of lessons) {
    if (update) {
      out.push(
        `INSERT INTO revisions (entity_type, entity_id, snapshot_json, note)
SELECT 'lesson', CAST(id AS TEXT), json_object('id', id, 'product_id', product_id, 'tab', tab, 'position', position, 'title', title, 'body', body, 'youtube_id', youtube_id, 'image_key', image_key, 'image_alt', image_alt, 'status', status, 'kind', kind, 'stage', stage, 'starting_position', starting_position, 'conducting', conducting, 'key_points', key_points, 'recommended_time', recommended_time, 'sheet_line', sheet_line, 'watch_for', watch_for, 'levels', levels), 'before content import'
FROM programme_lessons WHERE content_key = ${q(l.key)};`,
      );
    }
    out.push(
      `INSERT INTO programme_lessons (product_id, tab, position, title, body, youtube_id, status, content_key, kind, stage, starting_position, conducting, key_points, recommended_time, sheet_line, watch_for, levels)
SELECT ${product}, ${q(l.tab)}, ${l.position}, ${q(l.title)}, ${q(l.body)}, ${q(l.youtube)}, ${q(l.status)}, ${q(l.key)}, ${q(l.kind)}, ${q(l.stage)}, ${q(l.starting_position)}, ${q(l.conducting)}, ${q(l.key_points)}, ${q(l.recommended_time)}, ${q(l.sheet_line)}, ${q(l.watch_for)}, ${q(l.levels)}
WHERE ${product} IS NOT NULL
ON CONFLICT (content_key) DO ${
        update
          ? `UPDATE SET tab = excluded.tab, position = excluded.position, title = excluded.title, body = excluded.body, youtube_id = excluded.youtube_id, status = excluded.status,
  kind = excluded.kind, stage = excluded.stage, starting_position = excluded.starting_position, conducting = excluded.conducting, key_points = excluded.key_points,
  recommended_time = excluded.recommended_time, sheet_line = excluded.sheet_line, watch_for = excluded.watch_for, levels = excluded.levels, updated_at = datetime('now')`
          : "NOTHING"
      };`,
    );
  }
  return out.join("\n");
}

function main() {
  const [env, ...flags] = process.argv.slice(2);
  if (!["staging", "production"].includes(env)) {
    console.error("Usage: node scripts/import-content.mjs staging|production [--update] [--dry-run]");
    process.exit(1);
  }
  const update = flags.includes("--update");
  const sql = [];
  for (const slug of readdirSync(DIR).filter((d) => statSync(join(DIR, d)).isDirectory())) {
    const files = readdirSync(join(DIR, slug)).filter((f) => f.endsWith(".md")).sort();
    const lessons = files.map((f) => parseLessonFile(readFileSync(join(DIR, slug, f), "utf8"), `${slug}/${f}`));
    const keys = new Set();
    for (const l of lessons) {
      if (keys.has(l.key)) throw new Error(`${slug}: duplicate key ${l.key}`);
      keys.add(l.key);
    }
    console.log(`${slug}: ${lessons.length} section(s)`);
    sql.push(buildSql(slug, lessons, { update }));
  }
  const file = join(mkdtempSync(join(tmpdir(), "content-")), "import.sql");
  writeFileSync(file, sql.join("\n"));
  if (flags.includes("--dry-run")) return console.log(`Dry run: SQL written to ${file}`);
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--remote", "--env", env, "--file", file], { stdio: "inherit", env: { ...process.env, CI: "true" } });
  console.log(`✓ Imported into ${env}${update ? " (with updates)" : " (new sections only)"}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
