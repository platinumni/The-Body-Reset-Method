import { RECIPES, recipeById, type Recipe } from "../lib/meal-plans/recipes";
import type { Actor } from "./admin-content";
import { recordAudit } from "./audit";

// Recipe photos from Pixabay (free for commercial use, no credit needed: Pixabay Content License).
// Each chosen photo is downloaded into our own storage, never hotlinked, and its licence is recorded.

export const PIXABAY_LICENCE = "Pixabay Content License (https://pixabay.com/service/license-summary/)";
const API = "https://pixabay.com/api/";

export type Candidate = { id: string; pageUrl: string; previewUrl: string; largeUrl: string; user: string; tags: string };
export type RecipePhoto = { recipe_id: string; r2_key: string; source_id: string; page_url: string; photographer: string | null; chosen_by: "auto" | "owner"; version: number };

/** What to search for: the dish name without brackets and side dishes, e.g. "Spiced carrot soup with yoghurt swirl" → "spiced carrot soup". */
export function searchTerms(r: Pick<Recipe, "name">): string[] {
  const plain = r.name.replace(/\([^)]*\)/g, "").replace(/[^\p{L}\p{N}\s&-]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const main = plain.split(/\s+(?:with|and|on|&)\s+/)[0]!.trim();
  return [...new Set([plain, main].filter((t) => t.length > 2))].map((t) => t.slice(0, 100));
}

/** Pixabay food photos for one search. */
export async function searchPixabay(key: string, query: string, perPage = 6): Promise<Candidate[]> {
  const url = `${API}?${new URLSearchParams({ key, q: query, image_type: "photo", category: "food", safesearch: "true", orientation: "horizontal", per_page: String(Math.max(3, perPage)) })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  const body = (await res.json()) as { hits?: { id: number; pageURL: string; previewURL: string; largeImageURL: string; webformatURL: string; user: string; tags: string }[] };
  return (body.hits ?? []).map((h) => ({ id: String(h.id), pageUrl: h.pageURL, previewUrl: h.webformatURL || h.previewURL, largeUrl: h.largeImageURL || h.webformatURL, user: h.user, tags: h.tags }));
}

/** Candidates for a recipe: the full name first, then the main dish if that finds nothing. */
export async function candidatesFor(key: string, r: Recipe, perPage = 6): Promise<{ query: string; hits: Candidate[] }> {
  let last = "";
  for (const q of searchTerms(r)) {
    last = q;
    const hits = await searchPixabay(key, q, perPage);
    if (hits.length) return { query: q, hits };
  }
  return { query: last, hits: [] };
}

/** Only images from Pixabay's own servers are ever fetched. */
export const isPixabayImage = (u: string) => /^https:\/\/(cdn\.)?pixabay\.com\//.test(u);

/** Copy the photo into our storage and record it (replacing any earlier choice). */
export async function savePhoto(env: Env, recipeId: string, c: Candidate, query: string, chosenBy: "auto" | "owner", actor?: Actor): Promise<boolean> {
  if (!recipeById(recipeId) || !isPixabayImage(c.largeUrl)) return false;
  const img = await fetch(c.largeUrl);
  const type = img.headers.get("Content-Type") ?? "";
  if (!img.ok || !type.startsWith("image/")) return false;
  const key = `recipe-photos/${recipeId}.jpg`;
  await env.MEDIA.put(key, await img.arrayBuffer(), { httpMetadata: { contentType: type, cacheControl: "public, max-age=86400" } });
  await env.DB.prepare(
    `INSERT INTO recipe_photos (recipe_id, r2_key, source, source_id, page_url, photographer, licence, search, chosen_by)
     VALUES (?1, ?2, 'pixabay', ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT (recipe_id) DO UPDATE SET source_id = excluded.source_id, page_url = excluded.page_url, photographer = excluded.photographer,
       licence = excluded.licence, search = excluded.search, chosen_by = excluded.chosen_by, version = recipe_photos.version + 1, created_at = datetime('now')`,
  )
    .bind(recipeId, key, c.id, c.pageUrl, c.user || null, PIXABAY_LICENCE, query, chosenBy)
    .run();
  if (actor) await recordAudit(env.DB, { actorUserId: actor.userId, action: "recipe_photo.choose", targetType: "recipe", targetId: recipeId, ip: actor.ip, detail: { pixabay: c.id, chosenBy } });
  return true;
}

export async function removePhoto(env: Env, recipeId: string, actor: Actor): Promise<void> {
  await env.MEDIA.delete(`recipe-photos/${recipeId}.jpg`);
  await env.DB.prepare("DELETE FROM recipe_photos WHERE recipe_id = ?1").bind(recipeId).run();
  await recordAudit(env.DB, { actorUserId: actor.userId, action: "recipe_photo.remove", targetType: "recipe", targetId: recipeId, ip: actor.ip });
}

export async function listPhotos(db: D1Database): Promise<Map<string, RecipePhoto>> {
  const { results } = await db.prepare("SELECT recipe_id, r2_key, source_id, page_url, photographer, chosen_by, version FROM recipe_photos").all<RecipePhoto>();
  return new Map(results.map((r) => [r.recipe_id, r]));
}

/** Photo addresses for the views: recipe id → URL (with a version, so a new choice shows straight away). */
export async function photoUrls(db: D1Database): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [id, p] of await listPhotos(db)) out[id] = `/recipe-photos/${encodeURIComponent(id)}.jpg?v=${p.version}`;
  return out;
}

/** Auto-pick the top match for recipes that don't have a photo yet, a batch at a time. Returns how many were done and how many are left. */
export async function autoPickBatch(env: Env, batch = 12): Promise<{ done: number; none: string[]; left: number }> {
  const have = await listPhotos(env.DB);
  // Recipes with no match last time are skipped (choose those by hand), so the batches keep moving.
  const { results } = await env.DB.prepare("SELECT ref FROM automation_sent WHERE kind = 'photo-no-match'").all<{ ref: string }>();
  const skip = new Set(results.map((r) => r.ref));
  const missing = RECIPES.filter((r) => !have.has(r.id) && !skip.has(r.id));
  let done = 0;
  const none: string[] = [];
  for (const r of missing.slice(0, batch)) {
    const { query, hits } = await candidatesFor(env.PIXABAY_API_KEY!, r, 3);
    if (hits[0] && (await savePhoto(env, r.id, hits[0], query, "auto"))) done++;
    else {
      none.push(r.id);
      await env.DB.prepare("INSERT INTO automation_sent (kind, ref) VALUES ('photo-no-match', ?1) ON CONFLICT DO NOTHING").bind(r.id).run();
    }
  }
  return { done, none, left: Math.max(0, missing.length - batch) };
}

export async function noMatchCount(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM automation_sent a WHERE a.kind = 'photo-no-match' AND NOT EXISTS (SELECT 1 FROM recipe_photos p WHERE p.recipe_id = a.ref)").first<number>("n")) ?? 0;
}
