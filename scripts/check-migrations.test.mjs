import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMigrations } from "./check-migrations.mjs";

const f = (name, sql = "CREATE TABLE t (id INTEGER);", hash = "h-" + name) => ({ name, sql, hash });

test("accepts numbered, locked, add-only migrations", () => {
  assert.deepEqual(checkMigrations({ files: [f("0001_a.sql"), f("0002_b.sql")], lock: { "0001_a.sql": "h-0001_a.sql", "0002_b.sql": "h-0002_b.sql" } }), []);
});

test("rejects an edited locked migration", () => {
  const errs = checkMigrations({ files: [f("0001_a.sql", "x", "changed")], lock: { "0001_a.sql": "original" } });
  assert.match(errs.join(), /was edited/);
});

test("rejects a deleted locked migration", () => {
  assert.match(checkMigrations({ files: [], lock: { "0001_a.sql": "h" } }).join(), /was deleted/);
});

test("rejects gaps and bad names", () => {
  assert.match(checkMigrations({ files: [f("0001_a.sql"), f("0003_c.sql")], lock: {} }).join(), /expected number 0002/);
  assert.match(checkMigrations({ files: [f("1_Bad Name.sql")], lock: {} }).join(), /name must look like/);
});

test("rejects unlocked new migrations", () => {
  assert.match(checkMigrations({ files: [f("0001_a.sql")], lock: {} }).join(), /not in migrations.lock.json/);
});

test("rejects destructive SQL", () => {
  for (const sql of ["DROP TABLE users;", "ALTER TABLE users DROP COLUMN name;", "DELETE FROM users;", "ALTER TABLE a RENAME TO b;", "INSERT OR REPLACE INTO x VALUES (1);", "drop index i;"]) {
    assert.match(checkMigrations({ files: [f("0001_a.sql", sql)], lock: { "0001_a.sql": "h-0001_a.sql" } }).join(), /add-only/, sql);
  }
});

test("ignores destructive words inside comments", () => {
  assert.deepEqual(checkMigrations({ files: [f("0001_a.sql", "-- never DROP TABLE\nCREATE TABLE t (id INT);")], lock: { "0001_a.sql": "h-0001_a.sql" } }), []);
});
