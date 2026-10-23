// A member's library: the programmes they own, their content, and their progress.

export type OwnedProgramme = { id: number; slug: string; title: string; granted_at: string; lessons: number; done: number };

export async function listOwnedProgrammes(db: D1Database, userId: number): Promise<OwnedProgramme[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.slug, p.title, MIN(e.granted_at) AS granted_at,
         (SELECT COUNT(*) FROM programme_lessons l WHERE l.product_id = p.id AND l.status = 'published') AS lessons,
         (SELECT COUNT(*) FROM lesson_progress lp JOIN programme_lessons l ON l.id = lp.lesson_id
           WHERE lp.user_id = ?1 AND l.product_id = p.id AND l.status = 'published') AS done
       FROM entitlements e JOIN products p ON p.id = e.product_id
       WHERE e.user_id = ?1 AND e.revoked_at IS NULL
       GROUP BY p.id ORDER BY p.sort_order, p.id`,
    )
    .bind(userId)
    .all<OwnedProgramme>();
  return results;
}

export async function ownedProgrammeBySlug(db: D1Database, userId: number, slug: string): Promise<{ id: number; slug: string; title: string } | null> {
  return db
    .prepare(
      `SELECT p.id, p.slug, p.title FROM products p
       WHERE p.slug = ?2 AND EXISTS (SELECT 1 FROM entitlements e WHERE e.product_id = p.id AND e.user_id = ?1 AND e.revoked_at IS NULL)`,
    )
    .bind(userId, slug)
    .first<{ id: number; slug: string; title: string }>();
}

export type Tab = "full" | "quick";
export type Lesson = { id: number; title: string; body: string; youtube_id: string | null; image_key: string | null; image_alt: string | null; done: number };

export async function listLessons(db: D1Database, userId: number, productId: number, tab: Tab): Promise<Lesson[]> {
  const { results } = await db
    .prepare(
      `SELECT l.id, l.title, l.body, l.youtube_id, l.image_key, l.image_alt,
         EXISTS (SELECT 1 FROM lesson_progress lp WHERE lp.user_id = ?1 AND lp.lesson_id = l.id) AS done
       FROM programme_lessons l
       WHERE l.product_id = ?2 AND l.tab = ?3 AND l.status = 'published'
       ORDER BY l.position, l.id`,
    )
    .bind(userId, productId, tab)
    .all<Lesson>();
  return results;
}

/** Tick or untick a lesson. Only lessons in programmes the member owns can be ticked. */
export async function setLessonDone(db: D1Database, userId: number, productId: number, lessonId: number, done: boolean): Promise<boolean> {
  const lesson = await db
    .prepare("SELECT id FROM programme_lessons WHERE id = ?1 AND product_id = ?2 AND status = 'published'")
    .bind(lessonId, productId)
    .first();
  if (!lesson) return false;
  if (done) await db.prepare("INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING").bind(userId, lessonId).run();
  else await db.prepare("DELETE FROM lesson_progress WHERE user_id = ?1 AND lesson_id = ?2").bind(userId, lessonId).run();
  return true;
}

/** Can this member see this uploaded image? (It must belong to a programme they own.) */
export async function canViewMedia(db: D1Database, userId: number, key: string): Promise<boolean> {
  return !!(await db
    .prepare(
      `SELECT 1 FROM programme_lessons l JOIN entitlements e ON e.product_id = l.product_id
       WHERE l.image_key = ?1 AND l.status = 'published' AND e.user_id = ?2 AND e.revoked_at IS NULL LIMIT 1`,
    )
    .bind(key, userId)
    .first());
}
