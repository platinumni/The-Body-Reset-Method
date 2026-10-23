// Fixed-window rate limiting stored in D1 (e.g. "5 login attempts per 15 minutes per IP").

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export async function hitRateLimit(
  db: D1Database,
  bucket: string,
  limit: number,
  windowSeconds: number,
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  const now = Math.floor(nowMs / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, 1)
       ON CONFLICT (bucket, window_start) DO UPDATE SET hits = hits + 1
       RETURNING hits`,
    )
    .bind(bucket, windowStart)
    .first<{ hits: number }>();
  const hits = row?.hits ?? 1;
  return {
    allowed: hits <= limit,
    remaining: Math.max(0, limit - hits),
    retryAfterSeconds: windowStart + windowSeconds - now,
  };
}

/** Remove expired windows (housekeeping, run by the scheduled job). Not user data. */
export async function pruneRateLimits(db: D1Database, olderThanSeconds = 86_400, nowMs = Date.now()): Promise<void> {
  const cutoff = Math.floor(nowMs / 1000) - olderThanSeconds;
  await db.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(cutoff).run();
}
