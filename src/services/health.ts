/** Quick check that the database answers; used by the deploy script's smoke test. */
export async function databaseIsHealthy(db: D1Database): Promise<boolean> {
  try {
    return (await db.prepare("SELECT 1 AS ok").first<{ ok: number }>())?.ok === 1;
  } catch {
    return false;
  }
}
