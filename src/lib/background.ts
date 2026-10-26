/** Run work after the response is sent (Cloudflare waitUntil). Falls back to waiting when there's no execution context (tests). */
export async function inBackground(c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }, work: Promise<unknown>): Promise<void> {
  const safe = work.catch((err) => console.error("Background work failed", String(err)));
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    await safe;
  }
}
