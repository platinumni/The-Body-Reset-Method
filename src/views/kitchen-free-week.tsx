import { COUNTRIES, DAYS, STORES, money, type Plan, type PlanInput } from "../lib/meal-plans/planner";
import { ALLERGEN_LABELS } from "../lib/meal-plans/recipes";
import { CsrfField, Layout, type PageMeta } from "./layout";

const MEAL_LABELS: Record<string, string> = { Breakfasts: "Breakfast", Lunches: "Lunch", "Evening meals": "Evening meal", Snacks: "Snack" };
/** How much of each method the free week shows. */
export const FREE_METHOD_STEPS = 3;

/** The free week sign-up: budget and household, then email. No card. */
export function FreeWeekPage(props: { meta: PageMeta; csrfToken: string; input: PlanInput; errors?: string[]; email?: string; marketing?: boolean }) {
  const i = props.input;
  return (
    <Layout meta={props.meta}>
      <section class="hero kitchen-hero">
        <div class="wrap narrow">
          <p class="eyebrow">Body Regeneration Kitchen · free week</p>
          <h1>See a week of healthy meals built for your budget. Free.</h1>
          <p class="lede">Tell us your weekly budget and who you're feeding. We'll show you a full week of meals that fits, and what it should cost. Just your email, no card.</p>
        </div>
      </section>
      <section class="band">
        <div class="wrap narrow">
          {props.errors?.length ? (
            <div class="form-errors" role="alert">
              {props.errors.map((e) => (
                <p>{e}</p>
              ))}
            </div>
          ) : null}
          <form method="post" action="/kitchen/free-week" class="card meal-form">
            <CsrfField token={props.csrfToken} />
            <input type="hidden" name="submitted" value="yes" />
            <div class="hp" aria-hidden="true">
              <label for="fw-website">Leave this empty</label>
              <input id="fw-website" name="website" type="text" tabindex={-1} autocomplete="off" />
            </div>
            <div class="meal-form-grid">
              <div class="field">
                <label for="fw-budget">Weekly food budget</label>
                <div class="input-prefix">
                  <span>{COUNTRIES[i.country].symbol}</span>
                  <input id="fw-budget" name="budget" type="number" inputmode="numeric" min={10} max={1000} step={1} value={String(i.budget)} required />
                </div>
              </div>
              <div class="field">
                <label for="fw-country">Country</label>
                <select id="fw-country" name="country">
                  {Object.entries(COUNTRIES).map(([k, c]) => (
                    <option value={k} selected={k === i.country}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label for="fw-store">Where you usually shop</label>
                <select id="fw-store" name="store">
                  {Object.entries(STORES).map(([k, s]) => (
                    <option value={k} selected={k === i.store}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label for="fw-adults">Adults (teenagers count as adults)</label>
                <input id="fw-adults" name="adults" type="number" inputmode="numeric" min={1} max={12} value={String(i.adults)} />
              </div>
              <div class="field">
                <label for="fw-children">Children's ages (optional)</label>
                <input id="fw-children" name="children" type="text" inputmode="numeric" placeholder="e.g. 4, 9" value={i.childAges.join(", ")} />
              </div>
            </div>
            <fieldset class="field">
              <legend>Diet</legend>
              <div class="pill-choices">
                {(
                  [
                    ["any", "Everything"],
                    ["pescatarian", "No meat (fish OK)"],
                    ["vegetarian", "Vegetarian"],
                    ["vegan", "Vegan"],
                  ] as const
                ).map(([v, label]) => (
                  <label class="diet-pill">
                    <input type="radio" name="diet" value={v} checked={i.diet === v} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div class="field">
              <label for="fw-exclude">Foods to leave out (optional)</label>
              <input id="fw-exclude" name="exclude" type="text" placeholder="e.g. mushrooms, pork" value={i.exclude.join(", ")} />
            </div>
            <details class="field allergen-picker" open={i.avoidAllergens.length > 0}>
              <summary>Allergies</summary>
              <div class="check-grid">
                {Object.entries(ALLERGEN_LABELS).map(([k, label]) => (
                  <label class="check">
                    <input type="checkbox" name="allergens" value={k} checked={i.avoidAllergens.includes(k)} /> {label}
                  </label>
                ))}
              </div>
              <p class="hint">Recipes containing these are left out. We don't save your allergies. Always check product labels too.</p>
            </details>
            <label class="check">
              <input type="checkbox" name="snacks" value="yes" checked={i.snacks} /> Include snacks
            </label>
            <div class="field">
              <label for="fw-email">Your email</label>
              <input id="fw-email" name="email" type="email" autocomplete="email" required value={props.email ?? ""} />
              <p class="hint">
                We'll email you a link to your week, and one email at the end of the week asking if you'd like next week's plan. Nothing else unless you tick
                below.
              </p>
            </div>
            <label class="check">
              <input type="checkbox" name="marketing" value="yes" checked={props.marketing} /> Also send me occasional news and offers (optional, unsubscribe
              any time)
            </label>
            <button class="btn btn-primary btn-wide" type="submit">
              Show my free week
            </button>
            <p class="small muted">
              See our <a href="/legal/privacy">privacy policy</a>. General healthy eating, not a diet or medical advice.
            </p>
          </form>
        </div>
      </section>
    </Layout>
  );
}

/** The free week itself: every meal and the week's total, with a taste of each method. Ingredients and the shopping list are for members. */
export function FreeWeekResultPage(props: { meta: PageMeta; plan: Plan; justStarted: boolean; emailSent: boolean; priceSource: string | null }) {
  const { plan } = props;
  const country = plan.input.country;
  const cooked = plan.recipes.filter((r) => r.recipe.meal_type !== "Snacks");
  return (
    <Layout meta={props.meta}>
      <section class="hero kitchen-hero">
        <div class="wrap narrow">
          <p class="eyebrow">Body Regeneration Kitchen · your free week</p>
          <h1>
            Your week of meals: about {money(plan.weeklyCost, country)}
            {plan.portions > 1 ? ` for ${plan.input.adults + plan.input.childAges.length} people` : ""}
          </h1>
          <p class="lede">
            Budget {money(plan.input.budget, country)}.{" "}
            {plan.overBudget
              ? "We couldn't quite fit a full week into that budget, so this is the cheapest week we could make."
              : "Every breakfast, lunch and evening meal for seven days."}
          </p>
          {props.justStarted && (
            <p class="notice notice-ok" role="status">
              {props.emailSent ? "We've emailed you a link so you can come back to this week." : "You've already had a free week, so here it is again. We've emailed you a fresh link."}
            </p>
          )}
        </div>
      </section>
      <section class="band">
        <div class="wrap">
          <ol class="week">
            {DAYS.map((day, d) => (
              <li class="day card">
                <h3>{day}</h3>
                <ul>
                  {plan.slots
                    .filter((x) => x.day === d)
                    .map((x) => (
                      <li>
                        <span class="meal-label">{MEAL_LABELS[x.meal]}</span> {x.recipe.name}
                        {x.note ? <span class="small muted"> · {x.note}</span> : null}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section class="band band-quiet">
        <div class="wrap narrow">
          <header class="section-head">
            <h2>A taste of the recipes</h2>
            <p>The first steps of each one. Members get every ingredient, the full method and a shopping list for the week.</p>
          </header>
          {cooked.map(({ recipe }) => (
            <article class="card recipe-teaser">
              <h3>{recipe.name}</h3>
              <p class="small muted">
                {recipe.timing} · serves {recipe.serves}
              </p>
              <ol>
                {recipe.method.slice(0, FREE_METHOD_STEPS).map((m) => (
                  <li>{m}</li>
                ))}
              </ol>
              {recipe.method.length > FREE_METHOD_STEPS && <p class="small muted">…and {recipe.method.length - FREE_METHOD_STEPS} more steps, with the ingredients, in the full Kitchen.</p>}
            </article>
          ))}
        </div>
      </section>
      <section class="band" id="join">
        <div class="wrap narrow center">
          <h2>Want the full week, and next week's?</h2>
          <p class="prose-lg">Every ingredient and method, a shopping list priced for your budget, swaps for any meal, and a new week whenever you want one.</p>
          <p>
            <a class="btn btn-primary" href="/kitchen">
              See Body Regeneration Kitchen
            </a>
          </p>
          <p class="small muted">
            Costs are estimates using up-to-date official average prices{props.priceSource ? ` (${props.priceSource})` : ""}, updated monthly. Your shop may
            differ. Always check product labels for allergens. General healthy eating, not a diet or medical advice.
          </p>
        </div>
      </section>
    </Layout>
  );
}
