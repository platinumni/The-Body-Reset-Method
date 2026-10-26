import { TASTER, TASTER_SAFETY } from "../content/taster";
import { tasterDayEmail } from "../emails/automation";
import { unsubscribeUrl } from "./campaigns";
import { sendEmail } from "./email";
import { latestMarketingChoice } from "./subscribers";

// Short email series people ask for, sent one a day. Each step goes once (the step number
// only moves forward), and the series stops if they unsubscribe.

export type SequenceName = "taster";

/** Next email is due after about a day (a little under, so the daily job doesn't skip a day). */
const GAP_HOURS = 20;
const sqlTime = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

/** Start a series for someone (once only). Returns false if they're already on it. */
export async function startSequence(db: D1Database, email: string, sequence: SequenceName, now = new Date()): Promise<boolean> {
  const res = await db.prepare("INSERT INTO email_sequences (email, sequence, next_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING").bind(email, sequence, sqlTime(now)).run();
  return res.meta.changes === 1;
}

async function sendStep(env: Env, sequence: SequenceName, email: string, step: number): Promise<void> {
  const day = TASTER[step]!;
  const last = step === TASTER.length - 1;
  await sendEmail(
    env,
    tasterDayEmail({
      siteName: env.SITE_NAME,
      to: email,
      day: step + 1,
      content: day,
      safety: TASTER_SAFETY,
      buyUrl: last ? `${env.SITE_URL}/programmes/lower-body-regeneration` : null,
      unsubscribeUrl: await unsubscribeUrl(env, email),
    }),
  );
}

const length = (_s: SequenceName) => TASTER.length;

/** Send every email that's due. Run straight after a sign-up and by the daily job. */
export async function runSequences(env: Env, now = new Date(), onlyEmail?: string): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, email, sequence, step FROM email_sequences
     WHERE stopped_at IS NULL AND next_at IS NOT NULL AND next_at <= ?1 AND (?2 IS NULL OR email = ?2) LIMIT 300`,
  )
    .bind(sqlTime(now), onlyEmail ?? null)
    .all<{ id: number; email: string; sequence: SequenceName; step: number }>();
  let sent = 0;
  for (const r of results) {
    if ((await latestMarketingChoice(env.DB, r.email)) !== 1) {
      await env.DB.prepare("UPDATE email_sequences SET stopped_at = datetime('now'), next_at = NULL WHERE id = ?1").bind(r.id).run();
      continue;
    }
    const done = r.step + 1 >= length(r.sequence);
    // Claim the step first, so a second run at the same moment can't send it twice.
    const claimed = await env.DB.prepare("UPDATE email_sequences SET step = step + 1, next_at = ?3 WHERE id = ?1 AND step = ?2")
      .bind(r.id, r.step, done ? null : sqlTime(new Date(now.getTime() + GAP_HOURS * 3_600_000)))
      .run();
    if (claimed.meta.changes !== 1) continue;
    await sendStep(env, r.sequence, r.email, r.step);
    sent++;
  }
  return sent;
}
