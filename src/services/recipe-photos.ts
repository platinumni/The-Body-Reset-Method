import photoSearches from "../../content/meal-plans/photo-searches.json";
import { RECIPES, recipeById, type Recipe } from "../lib/meal-plans/recipes";
import type { Actor } from "./admin-content";
import { recordAudit } from "./audit";

// Recipe photos from Pixabay (free for commercial use, no credit needed: Pixabay Content License).
// Each chosen photo is downloaded into our own storage, never hotlinked, and its licence is recorded.

export const PIXABAY_LICENCE = "Pixabay Content License (https://pixabay.com/service/license-summary/)";
const API = "https://pixabay.com/api/";

/** Pixabay said "too many requests": stop for now and try again on the next run. */
export class RateLimited extends Error {}

export type Candidate = { id: string; pageUrl: string; previewUrl: string; largeUrl: string; user: string; tags: string; likes?: number };
export type RecipePhoto = { recipe_id: string; r2_key: string; source_id: string; page_url: string; photographer: string | null; chosen_by: "auto" | "owner"; version: number };

/** What to search for: the dish name without brackets and side dishes, e.g. "Spiced carrot soup with yoghurt swirl" → "spiced carrot soup". */
export function searchTerms(r: Pick<Recipe, "name">): string[] {
  const plain = r.name.replace(/\([^)]*\)/g, "").replace(/[^\p{L}\p{N}\s&-]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const main = plain.split(/\s+(?:with|and|on|&)\s+/)[0]!.trim();
  return [...new Set([plain, main].filter((t) => t.length > 2))].map((t) => t.slice(0, 100));
}

const SEARCHES = (photoSearches as { searches: Record<string, string> }).searches;
const REJECTS = (photoSearches as { photo_rejects: Record<string, string[]> }).photo_rejects;

/** Searches for the auto-picker: the short hand-written search first (content/meal-plans/photo-searches.json), then the dish name. */
export function photoSearchesFor(r: Pick<Recipe, "id" | "name">): string[] {
  return [...new Set([SEARCHES[r.id], ...searchTerms(r)].filter((t): t is string => !!t))];
}

const STOP = new Set(["and", "with", "the", "style", "homemade", "easy", "proper", "ultimate", "crispy", "creamy", "spiced", "one", "pot"]);
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
const words = (t: string) => t.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);

// Tags that mean raw ingredients rather than a finished dish.
const RAW = new Set(["raw", "isolated", "ingredient", "uncooked", "market", "grocery", "harvest", "produce"].map(stem));

/** The best photo for a recipe from one search: it must share a word with the search in its tags (so a "chilli beef" search can't pick bread rolls),
 *  it mustn't be raw ingredients, a photo already rejected for this recipe, or one already used for another recipe; then the most matching words and likes win. */
export function bestMatch(recipeId: string, query: string, hits: Candidate[], used: Set<string> = new Set()): Candidate | null {
  const want = new Set(words(query));
  const rejected = new Set(REJECTS[recipeId] ?? []);
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const h of hits) {
    if (rejected.has(h.id) || used.has(h.id)) continue;
    const tags = new Set(words(h.tags));
    if ([...tags].some((t) => RAW.has(t))) continue;
    const matched = [...want].filter((w) => tags.has(w)).length;
    if (!matched) continue;
    const score = matched * 1000 + Math.min(h.likes ?? 0, 999);
    if (score > bestScore) [best, bestScore] = [h, score];
  }
  return best;
}

/** Pixabay food photos for one search. */
export async function searchPixabay(key: string, query: string, perPage = 6): Promise<Candidate[]> {
  const url = `${API}?${new URLSearchParams({ key, q: query, image_type: "photo", category: "food", safesearch: "true", orientation: "horizontal", per_page: String(Math.max(3, perPage)) })}`;
  const res = await fetch(url);
  if (res.status === 429) throw new RateLimited("Pixabay rate limit");
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  const body = (await res.json()) as { hits?: { id: number; pageURL: string; previewURL: string; largeImageURL: string; webformatURL: string; user: string; tags: string; likes?: number }[] };
  return (body.hits ?? []).map((h) => ({ id: String(h.id), pageUrl: h.pageURL, previewUrl: h.webformatURL || h.previewURL, largeUrl: h.largeImageURL || h.webformatURL, user: h.user, tags: h.tags, likes: h.likes }));
}

/** Candidates for a recipe: the short search first, then the dish name, then the main dish if that finds nothing. */
export async function candidatesFor(key: string, r: Recipe, perPage = 6): Promise<{ query: string; hits: Candidate[] }> {
  let last = "";
  for (const q of photoSearchesFor(r)) {
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

/** Auto-pick the best match for recipes that don't have a photo yet, a batch at a time. Returns how many were done and how many are left.
 *  If Pixabay says "too many requests", it waits a minute and carries on while there's time left (budgetMs), otherwise it stops and the next run carries on. */
export async function autoPickBatch(env: Env, batch = 12, pauseMs = 0, budgetMs = 0): Promise<{ done: number; none: string[]; left: number; limited: boolean }> {
  const deadline = Date.now() + budgetMs;
  const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const have = await listPhotos(env.DB);
  // Recipes with no match last time are skipped (choose those by hand), so the batches keep moving.
  const { results } = await env.DB.prepare("SELECT ref FROM automation_sent WHERE kind = 'photo-no-match'").all<{ ref: string }>();
  const skip = new Set(results.map((r) => r.ref));
  const missing = RECIPES.filter((r) => !have.has(r.id) && !skip.has(r.id));
  const used = new Set([...have.values()].map((p) => p.source_id));
  let done = 0;
  const none: string[] = [];
  for (const r of missing.slice(0, batch)) {
    let pick: { query: string; hit: Candidate } | null = null;
    for (const query of photoSearchesFor(r)) {
      let hits: Candidate[] | null = null;
      while (!hits) {
        // Pixabay allows 100 searches a minute; the scheduled jobs pace themselves.
        if (pauseMs) await sleep(pauseMs);
        try {
          hits = await searchPixabay(env.PIXABAY_API_KEY!, query, 20);
        } catch (err) {
          if (!(err instanceof RateLimited)) throw err;
          // Keep what's done so far; wait a minute if there's time, else the next run carries on from here.
          if (Date.now() + 61_000 > deadline) return { done, none, left: missing.length - done - none.length, limited: true };
          await sleep(61_000);
        }
      }
      const hit = bestMatch(r.id, query, hits, used);
      if (hit) {
        pick = { query, hit };
        break;
      }
    }
    if (pick && (await savePhoto(env, r.id, pick.hit, pick.query, "auto"))) {
      used.add(pick.hit.id);
      done++;
    }
    else {
      none.push(r.id);
      await env.DB.prepare("INSERT INTO automation_sent (kind, ref) VALUES ('photo-no-match', ?1) ON CONFLICT DO NOTHING").bind(r.id).run();
    }
  }
  return { done, none, left: Math.max(0, missing.length - batch), limited: false };
}

export async function noMatchCount(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM automation_sent a WHERE a.kind = 'photo-no-match' AND NOT EXISTS (SELECT 1 FROM recipe_photos p WHERE p.recipe_id = a.ref)").first<number>("n")) ?? 0;
}

/** Scheduled job: if the Pixabay key is set, picks photos for any recipes still without one (all of them, paced, for up to budgetMs). */
export async function dailyPhotoPick(env: Env, budgetMs = 0): Promise<string> {
  if (!env.PIXABAY_API_KEY) return "no key";
  const r = await autoPickBatch(env, 200, 1500, budgetMs);
  return `${r.done} picked, ${r.none.length} no match, ${r.left} left${r.limited ? " (Pixabay asked us to slow down; carries on next run)" : ""}`;
}
