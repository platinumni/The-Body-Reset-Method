import type { Recipe } from "../../lib/meal-plans/recipes";
import type { Candidate, RecipePhoto } from "../../services/recipe-photos";
import { CsrfField } from "../layout";
import { AdminLayout, type AdminMeta } from "./layout";

const MEALS = ["Breakfasts", "Lunches", "Evening meals", "Snacks"] as const;

/** Every recipe with its photo; auto-pick the rest in batches. */
export function PhotosAdminPage(props: { meta: AdminMeta; recipes: Recipe[]; photos: Map<string, RecipePhoto>; configured: boolean; noMatch: number }) {
  const missing = props.recipes.filter((r) => !props.photos.has(r.id)).length;
  return (
    <AdminLayout meta={props.meta}>
      <h1>Recipe photos</h1>
      <p class="muted">
        Photos come from Pixabay (free for commercial use, no credit needed). Each one is copied to the website and its licence is recorded. Tap a recipe to
        choose a different photo.
      </p>
      {!props.configured ? (
        <p class="notice">
          Not set up yet: add a secret called <code>PIXABAY_API_KEY</code> in Cloudflare (Workers → this site → Settings → Variables and secrets).
        </p>
      ) : (
        <form method="post" action="/admin/photos/auto" class="card">
          <CsrfField token={props.meta.csrfToken} />
          <p>
            <strong>{props.recipes.length - missing}</strong> of {props.recipes.length} recipes have a photo.
            {props.noMatch > 0 && ` ${props.noMatch} found no match automatically: choose those by hand.`}
          </p>
          {missing > props.noMatch && (
            <button class="btn btn-primary btn-small" type="submit">
              Pick photos for the next 12
            </button>
          )}
          <p class="hint">Each tap does 12 (to stay within the website's limits). Tap again until it's done, then check them below.</p>
        </form>
      )}
      {MEALS.map((meal) => (
        <>
          <h2 class="h3">{meal}</h2>
          <ul class="photo-grid">
            {props.recipes
              .filter((r) => r.meal_type === meal)
              .map((r) => {
                const p = props.photos.get(r.id);
                return (
                  <li class="card photo-tile">
                    <a href={`/admin/photos/${encodeURIComponent(r.id)}`}>
                      {p ? <img src={`/recipe-photos/${encodeURIComponent(r.id)}.jpg?v=${p.version}`} alt="" loading="lazy" width={320} height={180} /> : <span class="photo-none">No photo</span>}
                      <span class="small">{r.name}</span>
                    </a>
                    {p?.chosen_by === "auto" && <span class="small muted">Auto-picked: check</span>}
                  </li>
                );
              })}
          </ul>
        </>
      ))}
    </AdminLayout>
  );
}

/** Choose a photo for one recipe from Pixabay's results, or search with other words. */
export function PhotoChoosePage(props: { meta: AdminMeta; recipe: Recipe; current: RecipePhoto | null; query: string; hits: Candidate[]; error?: string | null }) {
  const r = props.recipe;
  return (
    <AdminLayout meta={props.meta}>
      <p class="small">
        <a href="/admin/photos">← All recipe photos</a>
      </p>
      <h1>{r.name}</h1>
      {props.current ? (
        <p>
          <img src={`/recipe-photos/${encodeURIComponent(r.id)}.jpg?v=${props.current.version}`} alt="Current photo" width={320} height={180} />
          <br />
          <span class="small muted">
            Current: <a href={props.current.page_url}>Pixabay photo</a>
            {props.current.photographer ? ` by ${props.current.photographer}` : ""} ({props.current.chosen_by === "auto" ? "auto-picked" : "chosen by you"})
          </span>
        </p>
      ) : (
        <p class="muted">No photo yet.</p>
      )}
      <form method="get" action={`/admin/photos/${encodeURIComponent(r.id)}`} class="row">
        <label for="q" class="sr-only">
          Search
        </label>
        <input id="q" name="q" type="search" value={props.query} maxlength={100} />
        <button class="btn btn-ghost btn-small" type="submit">
          Search
        </button>
      </form>
      {props.error && <p class="form-errors">{props.error}</p>}
      {!props.hits.length && !props.error && <p class="muted">No photos found. Try simpler words, e.g. just "lentil soup".</p>}
      <ul class="photo-grid">
        {props.hits.map((h) => (
          <li class="card photo-tile">
            <img src={`/admin/photos/preview?u=${encodeURIComponent(h.previewUrl)}`} alt={h.tags} loading="lazy" width={320} height={180} />
            <form method="post" action={`/admin/photos/${encodeURIComponent(r.id)}`}>
              <CsrfField token={props.meta.csrfToken} />
              <input type="hidden" name="id" value={h.id} />
              <input type="hidden" name="page" value={h.pageUrl} />
              <input type="hidden" name="large" value={h.largeUrl} />
              <input type="hidden" name="user" value={h.user} />
              <input type="hidden" name="q" value={props.query} />
              <button class="btn btn-primary btn-small" type="submit">
                Use this one
              </button>
            </form>
          </li>
        ))}
      </ul>
      {props.current && (
        <form method="post" action={`/admin/photos/${encodeURIComponent(r.id)}/remove`}>
          <CsrfField token={props.meta.csrfToken} />
          <button class="btn btn-ghost btn-small" type="submit">
            Remove photo
          </button>
        </form>
      )}
    </AdminLayout>
  );
}
