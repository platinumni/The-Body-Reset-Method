import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSql, parseLessonFile, youtubeId } from "./import-content.mjs";

const file = `---
key: lbr-full-01-intro
tab: full
position: 1
title: It's the intro
status: draft
youtube: https://youtu.be/dQw4w9WgXcQ
---
Body with 'quotes'.`;

test("parses front matter and body", () => {
  const l = parseLessonFile(file);
  assert.equal(l.key, "lbr-full-01-intro");
  assert.equal(l.title, "It's the intro");
  assert.equal(l.youtube, "dQw4w9WgXcQ");
  assert.equal(l.body, "Body with 'quotes'.");
});

test("rejects bad files", () => {
  assert.throws(() => parseLessonFile("no front matter"), /front matter/);
  assert.throws(() => parseLessonFile(file.replace("tab: full", "tab: other")), /tab must be/);
  assert.throws(() => youtubeId("https://vimeo.com/1"), /Not a YouTube link/);
});

test("SQL escapes quotes and never duplicates (adds only by default)", () => {
  const sql = buildSql("lower-body-regeneration", [parseLessonFile(file)], { update: false });
  assert.match(sql, /'It''s the intro'/);
  assert.match(sql, /ON CONFLICT \(content_key\) DO NOTHING/);
  assert.doesNotMatch(sql, /INSERT INTO revisions/);
});

test("--update saves the old version to history first", () => {
  const sql = buildSql("x", [parseLessonFile(file)], { update: true });
  assert.ok(sql.indexOf("INSERT INTO revisions") < sql.indexOf("INSERT INTO programme_lessons"));
  assert.match(sql, /DO UPDATE SET/);
});
