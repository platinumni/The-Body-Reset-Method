import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { listAudit, recordAudit } from "../src/services/audit";
import { backupDatabase, listBackups } from "../src/services/backup";
import { databaseIsHealthy } from "../src/services/health";
import { hitRateLimit, pruneRateLimits } from "../src/services/rate-limit";
import { createSession, getSessionUser, revokeAllSessions, revokeSession } from "../src/services/sessions";
import { sha256Hex } from "../src/lib/crypto";

let userSeq = 0;
async function makeUser(email = `member${++userSeq}@example.com`) {
  const row = await env.DB.prepare("INSERT INTO users (email, name) VALUES (?1, 'Test') RETURNING id").bind(email).first<{ id: number }>();
  return row!.id;
}

describe("rate limiting", () => {
  it("allows up to the limit then blocks", async () => {
    const t = Date.UTC(2026, 0, 1, 12, 0, 10);
    for (let i = 0; i < 3; i++) expect((await hitRateLimit(env.DB, "login:1.2.3.4", 3, 60, t)).allowed).toBe(true);
    const blocked = await hitRateLimit(env.DB, "login:1.2.3.4", 3, 60, t);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(50);
  });

  it("keeps separate counts per bucket and resets each window", async () => {
    const t = Date.UTC(2026, 0, 1, 12, 0, 0);
    await hitRateLimit(env.DB, "a", 1, 60, t);
    expect((await hitRateLimit(env.DB, "b", 1, 60, t)).allowed).toBe(true);
    expect((await hitRateLimit(env.DB, "a", 1, 60, t + 61_000)).allowed).toBe(true);
  });

  it("prunes old windows", async () => {
    await hitRateLimit(env.DB, "old", 5, 60, Date.UTC(2020, 0, 1));
    await pruneRateLimits(env.DB);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE bucket = 'old'").first("n")).toBe(0);
  });
});

describe("sessions", () => {
  it("stores only a hash of the token and finds the user", async () => {
    const id = await makeUser();
    const { token } = await createSession(env.DB, id);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?1").bind(token).first("n")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).first("n")).toBe(1);
    expect((await getSessionUser(env.DB, token))?.id).toBe(id);
  });

  it("rejects unknown, revoked and expired sessions", async () => {
    const id = await makeUser();
    expect(await getSessionUser(env.DB, "nope")).toBeNull();
    expect(await getSessionUser(env.DB, undefined)).toBeNull();

    const a = await createSession(env.DB, id);
    await revokeSession(env.DB, a.token);
    expect(await getSessionUser(env.DB, a.token)).toBeNull();

    const b = await createSession(env.DB, id);
    await env.DB.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token_hash = ?1").bind(await sha256Hex(b.token)).run();
    expect(await getSessionUser(env.DB, b.token)).toBeNull();
  });

  it("can log a user out everywhere", async () => {
    const id = await makeUser();
    const a = await createSession(env.DB, id);
    const b = await createSession(env.DB, id);
    await revokeAllSessions(env.DB, id);
    expect(await getSessionUser(env.DB, a.token)).toBeNull();
    expect(await getSessionUser(env.DB, b.token)).toBeNull();
  });

  it("ignores deleted users", async () => {
    const id = await makeUser();
    const { token } = await createSession(env.DB, id);
    await env.DB.prepare("UPDATE users SET deleted_at = datetime('now') WHERE id = ?1").bind(id).run();
    expect(await getSessionUser(env.DB, token)).toBeNull();
  });
});

describe("audit log", () => {
  it("records admin actions newest first", async () => {
    await recordAudit(env.DB, { actorUserId: null, action: "programme.publish", targetType: "programme", targetId: 7, detail: { title: "Lower Body" } });
    await recordAudit(env.DB, { actorUserId: null, action: "programme.archive" });
    const rows = await listAudit(env.DB);
    expect(rows.map((r) => r.action)).toEqual(["programme.archive", "programme.publish"]);
    expect(rows[1]!.target_id).toBe("7");
    expect(JSON.parse(rows[1]!.detail_json!)).toEqual({ title: "Lower Body" });
  });
});

describe("backups", () => {
  it("writes every table to R2 and records the backup", async () => {
    await makeUser("backup@example.com");
    const result = await backupDatabase(env.DB, env.BACKUPS, "manual", new Date("2026-10-23T03:00:00Z"));
    expect(result.key).toBe("d1/2026-10-23/2026-10-23T03-00-00-000Z-manual.json");

    const obj = await env.BACKUPS.get(result.key);
    const dump = (await obj!.json()) as { tables: Record<string, { email?: string }[]> };
    expect(dump.tables.users!.some((u) => u.email === "backup@example.com")).toBe(true);
    expect(Object.keys(dump.tables)).toEqual(expect.arrayContaining(["users", "sessions", "audit_log", "consents", "backups", "settings"]));

    const [latest] = await listBackups(env.DB);
    expect(latest).toMatchObject({ kind: "manual", status: "ok", r2_key: result.key });
  });
});

describe("health", () => {
  it("reports the database is reachable", async () => {
    expect(await databaseIsHealthy(env.DB)).toBe(true);
  });
});
