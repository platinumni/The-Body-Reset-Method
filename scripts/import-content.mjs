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
  const position = Number(meta.position ?? 0);
  if (!Number.isInteger(position)) errors.push("position must be a whole number");
  if (errors.length) throw new Error(`${file}: ${errors.join("; ")}`);
  return { key: meta.key, tab: meta.tab, position, title: meta.title, status: meta.status ?? "draft", youtube: youtubeId(meta.youtube), body: m[2].trim() };
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
SELECT 'lesson', CAST(id AS TEXT), json_object('id', id, 'product_id', product_id, 'tab', tab, 'position', position, 'title', title, 'body', body, 'youtube_id', youtube_id, 'image_key', image_key, 'image_alt', image_alt, 'status', status), 'before content import'
FROM programme_lessons WHERE content_key = ${q(l.key)};`,
      );
    }
    out.push(
      `INSERT INTO programme_lessons (product_id, tab, position, title, body, youtube_id, status, content_key)
SELECT ${product}, ${q(l.tab)}, ${l.position}, ${q(l.title)}, ${q(l.body)}, ${q(l.youtube)}, ${q(l.status)}, ${q(l.key)}
WHERE ${product} IS NOT NULL
ON CONFLICT (content_key) DO ${
        update
          ? `UPDATE SET tab = excluded.tab, position = excluded.position, title = excluded.title, body = excluded.body, youtube_id = excluded.youtube_id, status = excluded.status, updated_at = datetime('now')`
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
