// Reports sign-ups and sales to the owner's growth engine, server to server.
// Events are saved first (engine_events), then sent; anything that fails is retried by the daily job.
// Never sends names or emails. A failure here never affects checkout or sign-up.

export type EngineEventType = "signup" | "lead" | "purchase" | "refund";

export type EngineEvent = {
  type: EngineEventType;
  /** The "ge" campaign reference the visitor arrived with, if any. */
  ref: string | null;
  /** A partner or share code, if one was used. */
  code: string | null;
  value_pence: number;
  confirmed: boolean;
  /** Our own id for the order or sign-up. The engine uses it to ignore repeats. */
  external_id: string;
  occurred_at: string;
};

export const GE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** A clean "ge" value, or null. */
export const cleanGe = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return GE_PATTERN.test(s) ? s : null;
};

const isoNow = () => new Date().toISOString();

/** Save an event for sending. Repeats (same external_id) are ignored. */
export async function queueEngineEvent(db: D1Database, e: Omit<EngineEvent, "occurred_at" | "confirmed"> & { occurred_at?: string; confirmed?: boolean }): Promise<void> {
  const event: EngineEvent = { confirmed: true, occurred_at: isoNow(), ...e, value_pence: Math.max(0, Math.round(e.value_pence)) };
  await db
    .prepare("INSERT INTO engine_events (external_id, type, payload) VALUES (?1, ?2, ?3) ON CONFLICT (external_id) DO NOTHING")
    .bind(event.external_id, event.type, JSON.stringify(event))
    .run();
}

export const engineConfigured = (env: Env) => !!env.GROWTH_ENGINE_URL && !!env.GROWTH_ENGINE_KEY;

const MAX_ATTEMPTS = 10;

/** Send waiting events. Returns how many were delivered. Safe to run at any time. */
export async function sendEngineEvents(env: Env, limit = 50): Promise<number> {
  if (!engineConfigured(env)) return 0;
  const { results } = await env.DB.prepare("SELECT id, payload FROM engine_events WHERE status = 'pending' ORDER BY id LIMIT ?1").bind(limit).all<{ id: number; payload: string }>();
  let sent = 0;
  for (const row of results) {
    let error: string | null = null;
    try {
      const res = await fetch(env.GROWTH_ENGINE_URL!, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.GROWTH_ENGINE_KEY}`, "Content-Type": "application/json" },
        body: row.payload,
        signal: AbortSignal.timeout(5000),
      });
      // 409 means the engine already has it.
      if (!res.ok && res.status !== 409) error = `HTTP ${res.status}`;
    } catch (err) {
      error = String(err).slice(0, 200);
    }
    if (error) {
      await env.DB.prepare("UPDATE engine_events SET attempts = attempts + 1, last_error = ?2, status = CASE WHEN attempts + 1 >= ?3 THEN 'failed' ELSE 'pending' END WHERE id = ?1")
        .bind(row.id, error, MAX_ATTEMPTS)
        .run();
    } else {
      await env.DB.prepare("UPDATE engine_events SET status = 'sent', sent_at = datetime('now'), attempts = attempts + 1, last_error = NULL WHERE id = ?1").bind(row.id).run();
      sent++;
    }
  }
  return sent;
}

/** Counts for the admin dashboard. */
export async function engineEventCounts(db: D1Database): Promise<{ pending: number; sent: number; failed: number }> {
  const { results } = await db.prepare("SELECT status, COUNT(*) AS n FROM engine_events GROUP BY status").all<{ status: string; n: number }>();
  const get = (s: string) => results.find((r) => r.status === s)?.n ?? 0;
  return { pending: get("pending"), sent: get("sent"), failed: get("failed") };
}
