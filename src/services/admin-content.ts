import { recordAudit } from "./audit";
import type { Product } from "./products";
import { getRevision, saveRevisionStmt } from "./revisions";

// Admin editing of products (programmes and bundles) and their lessons.
// Every change saves the previous version (undo) and writes to the audit log.

export type Actor = { userId: number; ip?: string };

const PRODUCT_COLS = "id, slug, title, kind, price_pence, currency, status, sort_order, monthly_pence";

export async function getProduct(db: D1Database, id: number): Promise<Product | null> {
  return db.prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE id = ?1`).bind(id).first<Product>();
}

export type ProductAdminRow = Product & { lessons: number; published: number; buyers: number };

export async function listProductsAdmin(db: D1Database): Promise<ProductAdminRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${PRODUCT_COLS.split(", ").map((c) => "p." + c).join(", ")},
        (SELECT COUNT(*) FROM programme_lessons l WHERE l.product_id = p.id AND l.status != 'archived') AS lessons,
        (SELECT COUNT(*) FROM programme_lessons l WHERE l.product_id = p.id AND l.status = 'published') AS published,
        (SELECT COUNT(DISTINCT e.email) FROM entitlements e WHERE e.product_id = p.id AND e.revoked_at IS NULL) AS buyers
       FROM products p ORDER BY p.status = 'archived', p.sort_order, p.id`,
    )
    .all<ProductAdminRow>();
  return results;
}

export type ProductInput = { title: string; pricePence: number | null; status: Product["status"]; sortOrder: number };

export function validateProduct(input: { title: string; price: string; status: string; sortOrder: string }): { value?: ProductInput; error?: string } {
  const title = input.title.trim();
  if (!title || title.length > 120) return { error: "Give it a title (up to 120 characters)." };
  let pricePence: number | null = null;
  if (input.price.trim()) {
    const n = Number(input.price.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0 || n > 10_000) return { error: "Price must be a number in pounds, e.g. 49 or 49.99." };
    pricePence = Math.round(n * 100);
  }
  const status = (["draft", "on_sale", "archived"] as const).find((s) => s === input.status);
  if (!status) return { error: "Choose a status." };
  if (status === "on_sale" && pricePence == null) return { error: "Set a price before putting it on sale." };
  return { value: { title, pricePence, status, sortOrder: Math.trunc(Number(input.sortOrder) || 0) } };
}

/** Kitchen only: a monthly price makes it a membership (the normal price is then the joining fee). Null = one-off. */
export async function setMonthlyPrice(db: D1Database, id: number, pence: number | null, actor: Actor): Promise<void> {
  await db.prepare("UPDATE products SET monthly_pence = ?1, updated_at = datetime('now') WHERE id = ?2 AND slug = 'meal-plans'").bind(pence, id).run();
  await recordAudit(db, { actorUserId: actor.userId, action: "product.monthly_price", targetType: "product", targetId: id, ip: actor.ip, detail: { monthly_pence: pence } });
}

export async function updateProduct(db: D1Database, id: number, input: ProductInput, actor: Actor): Promise<boolean> {
  const before = await getProduct(db, id);
  if (!before) return false;
  await db.batch([
    saveRevisionStmt(db, "product", id, before, actor.userId),
    db
      .prepare("UPDATE products SET title = ?1, price_pence = ?2, status = ?3, sort_order = ?4, updated_at = datetime('now') WHERE id = ?5")
      .bind(input.title, input.pricePence, input.status, input.sortOrder, id),
  ]);
  await recordAudit(db, { actorUserId: actor.userId, action: "product.update", targetType: "product", targetId: id, ip: actor.ip, detail: { before: { title: before.title, price_pence: before.price_pence, status: before.status }, after: input } });
  return true;
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "item";

async function uniqueSlug(db: D1Database, base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 2; await db.prepare("SELECT 1 FROM products WHERE slug = ?1").bind(slug).first(); i++) slug = `${slugify(base)}-${i}`;
  return slug;
}

export async function createProduct(db: D1Database, input: { title: string; kind: Product["kind"] }, actor: Actor): Promise<number> {
  const slug = await uniqueSlug(db, input.title);
  const id = (await db
    .prepare("INSERT INTO products (slug, title, kind, status, sort_order) VALUES (?1, ?2, ?3, 'draft', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM products)) RETURNING id")
    .bind(slug, input.title.trim().slice(0, 120), input.kind)
    .first<number>("id"))!;
  await recordAudit(db, { actorUserId: actor.userId, action: "product.create", targetType: "product", targetId: id, ip: actor.ip, detail: { title: input.title, kind: input.kind } });
  return id;
}

/** Copy a programme (and its lessons) as a new draft. */
export async function duplicateProduct(db: D1Database, id: number, actor: Actor): Promise<number | null> {
  const p = await getProduct(db, id);
  if (!p) return null;
  const newId = await createProduct(db, { title: `${p.title} (copy)`, kind: p.kind }, actor);
  await db.batch([
    db.prepare("UPDATE products SET price_pence = ?1 WHERE id = ?2").bind(p.price_pence, newId),
    db
      .prepare(
        `INSERT INTO programme_lessons (product_id, tab, position, title, body, youtube_id, image_key, image_alt, status)
         SELECT ?1, tab, position, title, body, youtube_id, image_key, image_alt, CASE status WHEN 'archived' THEN 'archived' ELSE 'draft' END
         FROM programme_lessons WHERE product_id = ?2`,
      )
      .bind(newId, id),
    db.prepare("INSERT INTO bundle_items (bundle_id, product_id) SELECT ?1, product_id FROM bundle_items WHERE bundle_id = ?2").bind(newId, id),
  ]);
  return newId;
}

export async function bundleItemIds(db: D1Database, bundleId: number): Promise<number[]> {
  const { results } = await db.prepare("SELECT product_id FROM bundle_items WHERE bundle_id = ?1").bind(bundleId).all<{ product_id: number }>();
  return results.map((r) => r.product_id);
}

/** Bundles only change what NEW buyers get; past buyers keep exactly what they bought. */
export async function setBundleItems(db: D1Database, bundleId: number, programmeIds: number[], actor: Actor): Promise<void> {
  const before = await bundleItemIds(db, bundleId);
  const { results } = await db.prepare("SELECT id FROM products WHERE kind = 'programme'").all<{ id: number }>();
  const valid = new Set(results.map((r) => r.id));
  const ids = [...new Set(programmeIds)].filter((x) => valid.has(x));
  await db.batch([
    db.prepare("DELETE FROM bundle_items WHERE bundle_id = ?1").bind(bundleId),
    ...ids.map((pid) => db.prepare("INSERT INTO bundle_items (bundle_id, product_id) VALUES (?1, ?2)").bind(bundleId, pid)),
  ]);
  await recordAudit(db, { actorUserId: actor.userId, action: "bundle.items", targetType: "product", targetId: bundleId, ip: actor.ip, detail: { before, after: ids } });
}

// --- Lessons ---------------------------------------------------------------

/** Only the exercise fields that are present (older saved versions may not have them). */
function pickExercise(x: Partial<ExerciseFields>): Partial<ExerciseFields> {
  const keys = Object.keys(EXERCISE_DEFAULTS) as (keyof ExerciseFields)[];
  return Object.fromEntries(keys.filter((k) => x[k] !== undefined).map((k) => [k, x[k]])) as Partial<ExerciseFields>;
}

export type LessonRow = {
  id: number;
  product_id: number;
  tab: "full" | "quick";
  position: number;
  title: string;
  body: string;
  youtube_id: string | null;
  image_key: string | null;
  image_alt: string | null;
  status: "draft" | "published" | "archived";
  updated_at: string;
} & ExerciseFields;

/** Extra parts an exercise has (all null for written sections). */
export type ExerciseFields = {
  kind: "section" | "exercise";
  stage: string | null;
  starting_position: string | null;
  conducting: string | null;
  key_points: string | null;
  recommended_time: string | null;
  sheet_line: string | null;
  watch_for: string | null;
  levels: string | null;
};

export const EXERCISE_DEFAULTS: ExerciseFields = {
  kind: "section",
  stage: null,
  starting_position: null,
  conducting: null,
  key_points: null,
  recommended_time: null,
  sheet_line: null,
  watch_for: null,
  levels: null,
};

const LESSON_COLS =
  "id, product_id, tab, position, title, body, youtube_id, image_key, image_alt, status, updated_at, kind, stage, starting_position, conducting, key_points, recommended_time, sheet_line, watch_for, levels";

export async function listLessonsAdmin(db: D1Database, productId: number): Promise<LessonRow[]> {
  const { results } = await db.prepare(`SELECT ${LESSON_COLS} FROM programme_lessons WHERE product_id = ?1 ORDER BY tab, position, id`).bind(productId).all<LessonRow>();
  return results;
}

export async function getLesson(db: D1Database, id: number): Promise<LessonRow | null> {
  return db.prepare(`SELECT ${LESSON_COLS} FROM programme_lessons WHERE id = ?1`).bind(id).first<LessonRow>();
}

export type LessonInput = Pick<LessonRow, "tab" | "title" | "body" | "youtube_id" | "image_alt" | "status"> & Partial<ExerciseFields> & { image_key?: string | null };

const exerciseValues = (i: Partial<ExerciseFields>) => {
  const f = { ...EXERCISE_DEFAULTS, ...i };
  return [f.kind, f.stage, f.starting_position, f.conducting, f.key_points, f.recommended_time, f.sheet_line, f.watch_for, f.levels] as const;
};

export async function createLesson(db: D1Database, productId: number, input: LessonInput, actor: Actor): Promise<number> {
  const id = (await db
    .prepare(
      `INSERT INTO programme_lessons (product_id, tab, position, title, body, youtube_id, image_key, image_alt, status,
         kind, stage, starting_position, conducting, key_points, recommended_time, sheet_line, watch_for, levels)
       VALUES (?1, ?2, (SELECT COALESCE(MAX(position), 0) + 1 FROM programme_lessons WHERE product_id = ?1 AND tab = ?2), ?3, ?4, ?5, ?6, ?7, ?8,
         ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17) RETURNING id`,
    )
    .bind(productId, input.tab, input.title, input.body, input.youtube_id, input.image_key ?? null, input.image_alt, input.status, ...exerciseValues(input))
    .first<number>("id"))!;
  await recordAudit(db, { actorUserId: actor.userId, action: "lesson.create", targetType: "lesson", targetId: id, ip: actor.ip, detail: { title: input.title, status: input.status } });
  return id;
}

export async function updateLesson(db: D1Database, id: number, input: LessonInput, actor: Actor, note?: string): Promise<boolean> {
  const before = await getLesson(db, id);
  if (!before) return false;
  const imageKey = input.image_key === undefined ? before.image_key : input.image_key;
  await db.batch([
    saveRevisionStmt(db, "lesson", id, before, actor.userId, note),
    db
      .prepare(
        `UPDATE programme_lessons SET tab = ?1, title = ?2, body = ?3, youtube_id = ?4, image_key = ?5, image_alt = ?6, status = ?7,
           position = CASE WHEN tab = ?1 THEN position ELSE (SELECT COALESCE(MAX(position), 0) + 1 FROM programme_lessons WHERE product_id = ?9 AND tab = ?1) END,
           kind = ?10, stage = ?11, starting_position = ?12, conducting = ?13, key_points = ?14, recommended_time = ?15, sheet_line = ?16,
           watch_for = ?17, levels = ?18,
           updated_at = datetime('now') WHERE id = ?8`,
      )
      .bind(input.tab, input.title, input.body, input.youtube_id, imageKey, input.image_alt, input.status, id, before.product_id, ...exerciseValues({ ...pickExercise(before), ...input })),
  ]);
  await recordAudit(db, { actorUserId: actor.userId, action: note === "restore" ? "lesson.restore" : "lesson.update", targetType: "lesson", targetId: id, ip: actor.ip, detail: { title: input.title, status: input.status } });
  return true;
}

/** Move a lesson up or down within its tab by swapping positions with its neighbour. */
export async function moveLesson(db: D1Database, id: number, direction: "up" | "down", actor: Actor): Promise<void> {
  const l = await getLesson(db, id);
  if (!l) return;
  const all = (await listLessonsAdmin(db, l.product_id)).filter((x) => x.tab === l.tab);
  const i = all.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  const other = all[j];
  if (!other) return;
  // Renumber the whole tab so positions are always clean and distinct.
  [all[i], all[j]] = [other, l];
  await db.batch(all.map((x, k) => db.prepare("UPDATE programme_lessons SET position = ?1 WHERE id = ?2").bind(k + 1, x.id)));
  await recordAudit(db, { actorUserId: actor.userId, action: "lesson.move", targetType: "lesson", targetId: id, ip: actor.ip, detail: { direction } });
}

export async function duplicateLesson(db: D1Database, id: number, actor: Actor): Promise<number | null> {
  const l = await getLesson(db, id);
  if (!l) return null;
  return createLesson(db, l.product_id, { ...l, title: `${l.title} (copy)`, status: "draft" }, actor);
}

/** Put back an earlier version (the current one is saved first, so this can be undone too). */
export async function restoreLessonRevision(db: D1Database, revisionId: number, actor: Actor): Promise<number | null> {
  const rev = await getRevision(db, revisionId);
  if (!rev || rev.entity_type !== "lesson") return null;
  const snap = JSON.parse(rev.snapshot_json) as LessonRow;
  await updateLesson(
    db,
    Number(rev.entity_id),
    { tab: snap.tab, title: snap.title, body: snap.body, youtube_id: snap.youtube_id, image_key: snap.image_key, image_alt: snap.image_alt, status: snap.status, ...EXERCISE_DEFAULTS, ...pickExercise(snap) },
    actor,
    "restore",
  );
  return Number(rev.entity_id);
}

export async function restoreProductRevision(db: D1Database, revisionId: number, actor: Actor): Promise<number | null> {
  const rev = await getRevision(db, revisionId);
  if (!rev || rev.entity_type !== "product") return null;
  const snap = JSON.parse(rev.snapshot_json) as Product;
  await updateProduct(db, Number(rev.entity_id), { title: snap.title, pricePence: snap.price_pence, status: snap.status, sortOrder: snap.sort_order }, actor);
  return Number(rev.entity_id);
}

// --- Images ----------------------------------------------------------------

export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Store an uploaded image in R2. Returns the key, or an error message. */
export async function storeImage(bucket: R2Bucket, file: File): Promise<{ key?: string; error?: string }> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: "Images must be JPG, PNG, WebP or GIF." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Images must be under 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check the file really is the image type it claims (by its first bytes).
  const sig = [...bytes.slice(0, 12)];
  const isJpeg = sig[0] === 0xff && sig[1] === 0xd8;
  const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
  const isGif = sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46;
  const isWebp = sig[0] === 0x52 && sig[1] === 0x49 && sig[8] === 0x57 && sig[9] === 0x45;
  if (!({ jpg: isJpeg, png: isPng, gif: isGif, webp: isWebp } as Record<string, boolean>)[ext]) return { error: "That file doesn't look like a real image." };
  const key = `lessons/${crypto.randomUUID()}.${ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: file.type } });
  return { key };
}
