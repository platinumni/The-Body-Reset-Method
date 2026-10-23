// Database backups to R2: every table dumped to one JSON file.
// Runs weekly from the cron job; the deploy script also takes a full SQL export before each live deploy.

const PAGE = 1000;

export type BackupResult = { key: string; tables: number; rows: number; bytes: number };

async function listTables(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

export async function backupDatabase(db: D1Database, bucket: R2Bucket, kind: "weekly" | "manual", now = new Date()): Promise<BackupResult> {
  const key = `d1/${now.toISOString().slice(0, 10)}/${now.toISOString().replace(/[:.]/g, "-")}-${kind}.json`;
  try {
    const tables: Record<string, unknown[]> = {};
    let rows = 0;
    for (const name of await listTables(db)) {
      const all: unknown[] = [];
      for (let offset = 0; ; offset += PAGE) {
        // Table names come from sqlite_master, not user input; quoted for safety.
        const { results } = await db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT ?1 OFFSET ?2`).bind(PAGE, offset).all();
        all.push(...results);
        if (results.length < PAGE) break;
      }
      tables[name] = all;
      rows += all.length;
    }
    const body = JSON.stringify({ createdAt: now.toISOString(), kind, tables });
    await bucket.put(key, body, { httpMetadata: { contentType: "application/json" } });
    const result = { key, tables: Object.keys(tables).length, rows, bytes: body.length };
    await db
      .prepare("INSERT INTO backups (kind, r2_key, size_bytes, table_count, row_count, status) VALUES (?1, ?2, ?3, ?4, ?5, 'ok')")
      .bind(kind, key, result.bytes, result.tables, result.rows)
      .run();
    return result;
  } catch (err) {
    await db.prepare("INSERT INTO backups (kind, status, error) VALUES (?1, 'failed', ?2)").bind(kind, String(err).slice(0, 500)).run();
    throw err;
  }
}

export type BackupRow = { id: number; kind: string; r2_key: string | null; size_bytes: number | null; row_count: number | null; status: string; error: string | null; created_at: string };

export async function listBackups(db: D1Database, limit = 20): Promise<BackupRow[]> {
  const { results } = await db.prepare("SELECT id, kind, r2_key, size_bytes, row_count, status, error, created_at FROM backups ORDER BY id DESC LIMIT ?1").bind(limit).all<BackupRow>();
  return results;
}
