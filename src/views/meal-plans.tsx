import { COUNTRIES, DAYS, FOOD_STYLES, LEAVE_OUT_WORDS, PORTION_SIZES, STORES, money, type Plan, type PlanInput } from "../lib/meal-plans/planner";
import { formatPeriod, REGION_LABELS } from "../lib/meal-plans/official";
import { PRICES_AS_OF } from "../lib/meal-plans/prices";
import { ALLERGEN_LABELS, type Recipe } from "../lib/meal-plans/recipes";
import { assetUrl } from "../routes/assets";
import { CsrfField, Layout, type PageMeta } from "./layout";

const MEAL_LABELS: Record<string, string> = { Breakfasts: "Breakfast", Lunches: "Lunch", "Evening meals": "Evening meal", Snacks: "Snack" };

/** The plan's choices as a query string, so every link (swap, shuffle, update) keeps them. */
export function planQuery(input: PlanInput, change: Partial<PlanInput> = {}): string {
  const i = { ...input, ...change };
  const q = new URLSearchParams({
    submitted: "yes",
    budget: String(i.budget),
    country: i.country,
    store: i.store,
    adults: String(i.adults),
    children: i.childAges.join(","),
    sizes: (i.adultSizes ?? []).join(","),
    diet: i.diet,
    exclude: i.exclude.join(","),
    allergens: i.avoidAllergens.join(","),
    snacks: i.snacks ? "yes" : "no",
    seed: String(i.seed),
    have: i.have.join(","),
    usual: i.usual ? String(i.usual) : "",
    region: i.region ?? "national",
    style: (i.styles ?? []).join(","),
  });
  if (i.picks?.length) q.set("picks", i.picks.join(","));
  return `/account/meal-plans?${q.toString()}`;
}

const MAX_PEOPLE = 8;
const ACTIVITY: [string, string][] = [
  ["1.2", "Mostly sitting"],
  ["1.375", "Lightly active"],
  ["1.55", "Moderately active"],
  ["1.725", "Very active"],
];

/**
 * Who's eating: a portion size for each adult (with an optional calorie estimate that suggests one),
 * and an age for each child. Boxes appear for as many people as chosen (with JavaScript; without it,
 * choosing a number and pressing the button shows the right boxes).
 */
export function HouseholdFields(props: { prefix: string; adults: number; sizes: number[]; childAges: number[] }) {
  const p = props.prefix;
  const range = (n: number) => Array.from({ length: n }, (_, k) => k);
  return (
    <div class="household" data-household>
      <div class="meal-form-grid">
        <div class="field">
          <label for={`${p}-adults`}>Adults (18 and over)</label>
          <select id={`${p}-adults`} name="adults" data-count="adult">
            {range(MAX_PEOPLE).map((k) => (
              <option value={String(k + 1)} selected={k + 1 === props.adults}>
                {k + 1}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for={`${p}-kids`}>Children (17 and under)</label>
          <select id={`${p}-kids`} name="kidcount" data-count="child">
            {range(MAX_PEOPLE + 1).map((k) => (
              <option value={String(k)} selected={k === props.childAges.length}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div class="people">
        {range(MAX_PEOPLE).map((k) => (
          <div class="person card" data-person="adult" data-index={String(k + 1)} hidden={k >= props.adults}>
            <label for={`${p}-size-${k}`}>Adult {k + 1}: portion size</label>
            <select id={`${p}-size-${k}`} name="size" data-size>
              {PORTION_SIZES.map((s) => (
                <option value={String(s.value)} selected={(props.sizes[k] ?? 1) === s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <details class="calorie-calc" data-calorie-calc hidden>
              <summary>Not sure? Work it out from calories</summary>
              <div class="meal-form-grid">
                <label>
                  Sex
                  <select data-cc="sex">
                    <option value="f">Female</option>
                    <option value="m">Male</option>
                  </select>
                </label>
                <label>
                  Age
                  <input data-cc="age" type="number" inputmode="numeric" min={18} max={100} />
                </label>
                <label>
                  Height (cm)
                  <input data-cc="height" type="number" inputmode="numeric" min={120} max={230} />
                </label>
                <label>
                  Weight (kg)
                  <input data-cc="weight" type="number" inputmode="decimal" min={30} max={300} step="0.1" />
                </label>
                <label>
                  How active?
                  <select data-cc="activity">
                    {ACTIVITY.map(([v, label]) => (
                      <option value={v} selected={v === "1.375"}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p class="calorie-result" data-calorie-result aria-live="polite"></p>
              <p class="small muted">
                A rough guide to maintain weight, worked out on your phone and never saved. Not advice: if you want to gain or lose weight, are pregnant, or
                have a medical condition, speak to your GP, a registered dietitian or a registered nutritionist.
              </p>
            </details>
          </div>
        ))}
        {range(MAX_PEOPLE).map((k) => (
          <div class="person card" data-person="child" data-index={String(k + 1)} hidden={k >= props.childAges.length}>
            <label for={`${p}-child-${k}`}>Child {k + 1}: age</label>
            <select id={`${p}-child-${k}`} name="child">
              {range(18).map((a) => (
                <option value={String(a)} selected={(props.childAges[k] ?? 8) === a}>
                  {a === 0 ? "Under 1" : a}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p class="hint">Portions are sized for each person. Bigger portions mean a bigger shop, and your plan's total shows the cost.</p>
    </div>
  );
}

/** "Food style": guides the plan towards more meat, more filling carbs, or plain food. Nothing is ruled out. */
export function FoodStyleField(props: { styles: string[] }) {
  return (
    <fieldset class="field">
      <legend>Food style (optional)</legend>
      <div class="pill-choices">
        {Object.entries(FOOD_STYLES).map(([v, label]) => (
          <label class="diet-pill">
            <input type="checkbox" name="style" value={v} checked={props.styles.includes(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <p class="hint">Tick any. Your plan leans that way where your budget allows, and you can still swap any meal.</p>
    </fieldset>
  );
}

function PlanForm(props: { input: PlanInput; regions: { uk?: string[]; us: string[]; ca: string[] } }) {
  const i = props.input;
  return (
    <form method="get" action="/account/meal-plans" class="card meal-form no-print">
      <input type="hidden" name="submitted" value="yes" />
      <div class="meal-form-grid">
        <div class="field">
          <label for="mp-budget">Weekly budget</label>
          <div class="input-prefix">
            <span>{COUNTRIES[i.country].symbol}</span>
            <input id="mp-budget" name="budget" type="number" inputmode="numeric" min={10} max={1000} step={1} value={String(i.budget)} required />
          </div>
          <p class="hint">Any amount, to the pound.</p>
        </div>
        <div class="field">
          <label for="mp-country">Country</label>
          <select id="mp-country" name="country">
            {Object.entries(COUNTRIES).map(([k, c]) => (
              <option value={k} selected={k === i.country}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="mp-region">Region</label>
          <select id="mp-region" name="region">
            <option value="national" selected={!i.region || i.region === "national"}>
              National average
            </option>
            {props.regions.uk?.length ? (
              <optgroup label="United Kingdom">
                {props.regions.uk.map((r) => (
                  <option value={r} selected={i.region === r}>
                    {r}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="United States">
              {props.regions.us.map((r) => (
                <option value={r} selected={i.region === r}>
                  {REGION_LABELS[r] ?? r}
                </option>
              ))}
            </optgroup>
            <optgroup label="Canada">
              {props.regions.ca.map((r) => (
                <option value={r} selected={i.region === r}>
                  {r}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div class="field">
          <label for="mp-store">Where you usually shop</label>
          <select id="mp-store" name="store">
            {Object.entries(STORES).map(([k, s]) => (
              <option value={k} selected={k === i.store}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="mp-usual">What you usually spend on food a week (optional)</label>
          <div class="input-prefix">
            <span>{COUNTRIES[i.country].symbol}</span>
            <input id="mp-usual" name="usual" type="number" inputmode="numeric" min={1} max={5000} step={1} value={i.usual ? String(i.usual) : ""} />
          </div>
          <p class="hint">So we can show what you could save.</p>
        </div>
      </div>
      <HouseholdFields prefix="mp" adults={i.adults} sizes={i.adultSizes ?? []} childAges={i.childAges} />
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
      <FoodStyleField styles={i.styles ?? []} />
      <div class="field">
        <label for="mp-exclude">Foods to leave out</label>
        <input id="mp-exclude" name="exclude" type="text" list="mp-foods" placeholder="e.g. mushrooms, pork, fish" value={i.exclude.join(", ")} />
        <datalist id="mp-foods">
          {LEAVE_OUT_WORDS.map((w) => (
            <option value={w} />
          ))}
        </datalist>
        <p class="hint">Start typing and pick from the list, or type your own. Separate with commas.</p>
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
        <p class="hint">Recipes containing these are left out. Always check product labels too.</p>
      </details>
      <label class="check">
        <input type="checkbox" name="snacks" value="yes" checked={i.snacks} /> Include snacks
      </label>
      {i.have.map((h) => (
        <input type="hidden" name="have" value={h} />
      ))}
      <button class="btn btn-primary btn-wide" type="submit">
        Make my plan
      </button>
    </form>
  );
}

function Notes(props: { plan: Plan }) {
  const { plan } = props;
  const c = COUNTRIES[plan.input.country];
  const book = plan.input.book;
  const officialCount = plan.shopping.filter((l) => l.official).length;
  const toddlers = plan.input.childAges.some((a) => a >= 1 && a <= 3);
  return (
    <aside class="meal-notes">
      {book?.source ? (
        <p>
          <strong>Prices:</strong> {officialCount} of the {plan.shopping.length} items on your list use official average prices from {book.source} (
          {book.note}, latest {formatPeriod(book.period)}){book.region !== "national" ? `, for ${REGION_LABELS[book.region] ?? book.region}` : ""}. The rest
          are our estimates{plan.input.country === "uk" ? ", kept up to date with official food price changes" : ""}. All prices are adjusted for{" "}
          {STORES[plan.input.store].label.split(" (")[0]!.toLowerCase()} supermarkets. They're averages, so actual prices in store will vary.
        </p>
      ) : (
        <p>
          <strong>Prices are estimates</strong> for {STORES[plan.input.store].label.split(" (")[0]!.toLowerCase()} supermarkets in {c.label}, checked{" "}
          {PRICES_AS_OF}. Actual prices in store will vary.
        </p>
      )}
      <p>
        These plans are designed to <strong>maintain your current weight</strong>. If you want to gain or lose weight, speak to your GP, a registered
        dietitian or a registered nutritionist. This is general healthy eating, not advice for medical conditions.
      </p>
      <p>
        <strong>Allergies:</strong> recipes are filtered on their listed ingredients, but brands differ and products can contain hidden allergens or
        "may contain" traces. Always check product labels. If you have a serious allergy, check with your GP or dietitian.
      </p>
      <h3 class="h4">Leftovers, safely</h3>
      <p>
        Following the Food Standards Agency's guidance: cool leftovers within 2 hours and keep them in the fridge. Eat them within 2 days, or cooked rice
        within 1 day. Reheat until steaming hot all the way through, and only reheat once. Meals marked "frozen" in your plan go in the freezer on the day
        you cook them; defrost them in the fridge the night before.
      </p>
      {plan.babies > 0 && <p>Babies under 1 aren't included in the portions. Follow the NHS weaning guidance for them.</p>}
      {toddlers && <p>For toddlers: no added salt, and cut up or leave out whole nuts and whole grapes (choking risk).</p>}
    </aside>
  );
}

function RecipeCard(props: { recipe: Recipe; times: number; scale: number; portions: number; swaps: Recipe[]; input: PlanInput; allIds: string[]; favourite: boolean; csrfToken: string; photo?: string }) {
  const { recipe: r, input } = props;
  const made = Math.round(props.portions * props.times * 10) / 10;
  return (
    <article class="card recipe-card" id={`r-${r.id}`}>
      {props.photo ? (
        <img class="recipe-img" src={props.photo} alt={r.name} loading="lazy" width={640} height={360} />
      ) : (
        <div class="recipe-photo" aria-hidden="true">
          <span>{r.name}</span>
        </div>
      )}
      <p class="eyebrow">{MEAL_LABELS[r.meal_type]}</p>
      <h3>{r.name}</h3>
      <form method="post" action="/account/meal-plans/favourite" class="inline-form no-print">
        <CsrfField token={props.csrfToken} />
        <input type="hidden" name="recipe" value={r.id} />
        <input type="hidden" name="query" value={planQuery(input).split("?")[1]} />
        <button class="btn btn-ghost btn-small" type="submit" aria-pressed={props.favourite ? "true" : "false"}>
          {props.favourite ? "★ Favourite" : "☆ Add to favourites"}
        </button>
      </form>
      <p class="small muted">
        Prep {r.prep_minutes} min{r.cook_minutes ? ` · cook ${r.cook_minutes} min` : ""} · makes {made} portion{made === 1 ? "" : "s"} this week (
        {props.scale === 1 ? "as written" : `${Math.round(props.scale * 10) / 10}× the amounts below`})
      </p>
      {r.allergens.length > 0 && (
        <p class="allergen-tags">
          Contains:{" "}
          {r.allergens.map((a) => (
            <span class="tag">{ALLERGEN_LABELS[a] ?? a}</span>
          ))}
        </p>
      )}
      <h4>Ingredients (serves {r.serves})</h4>
      <ul class="ingredients">
        {r.ingredients.map((i) => (
          <li>
            <strong>{i.amount}</strong> {i.name}
          </li>
        ))}
      </ul>
      <h4>Method</h4>
      <ol class="method">
        {r.method.map((m) => (
          <li>{m}</li>
        ))}
      </ol>
      {r.notes.map((n) => (
        <p class="small muted">{n}</p>
      ))}
      {props.swaps.length > 0 && (
        <div class="swaps no-print">
          <p class="small">
            <strong>Fancy something else?</strong> Swap for:
          </p>
          <ul>
            {props.swaps.map((s) => (
              <li>
                <a href={`${planQuery(input, { picks: props.allIds.map((id) => (id === r.id ? s.id : id)) })}#r-${s.id}`}>{s.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function MealPlannerPage(props: {
  meta: PageMeta;
  csrfToken: string;
  input: PlanInput;
  plan: Plan | null;
  saved?: boolean;
  spent?: boolean;
  spend: import("../services/meal-plans").SpendSummary;
  regions: { uk?: string[]; us: string[]; ca: string[] };
  favourites?: string[];
  hasMembership?: boolean;
  photos?: Record<string, string>;
}) {
  const { plan, input } = props;
  const cur = (n: number) => money(n, input.country);
  const allIds = plan?.recipes.map((r) => r.recipe.id) ?? [];
  const toBuy = plan?.shopping.filter((l) => !l.cupboard) ?? [];
  const cupboard = plan?.shopping.filter((l) => l.cupboard) ?? [];
  const household = `${input.adults} adult${input.adults === 1 ? "" : "s"}${input.childAges.length ? `, ${input.childAges.length} child${input.childAges.length === 1 ? "" : "ren"}` : ""}`;
  return (
    <Layout meta={props.meta}>
      {plan && (
        <section class="print-cover">
          <p class="eyebrow">The Body Regeneration Method</p>
          <h1>Meal Plan</h1>
          <p class="print-cover-sub">
            One week · budget {cur(input.budget)} · estimated {cur(plan.weeklyCost)} · {household}
          </p>
          <p class="small">Prices: {input.book?.source ? `official averages (${formatPeriod(input.book.period)}) and estimates` : `estimated, ${PRICES_AS_OF}`}. Made for you on {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.</p>
        </section>
      )}
      <section class="page-hero no-print">
        <div class="wrap narrow">
          <p class="small">
            <a href="/account">← My programmes</a>
            {props.hasMembership && (
              <>
                {" · "}
                <a href="/account/membership">Manage membership</a>
              </>
            )}
          </p>
          <p class="eyebrow">Budget meal plans</p>
          <h1>Your week of meals</h1>
          <p class="lede">Set your budget and household, and we'll build a healthy week that fits, with recipes and a shopping list.</p>
        </div>
      </section>
      <section class="band band-tight">
        <div class="wrap narrow">
          {props.saved && (
            <p class="notice notice-ok no-print" role="status">
              Saved. These choices will be ready next time.
            </p>
          )}
          <PlanForm input={input} regions={props.regions} />
          {plan && (
            <>
              <div class="card plan-summary">
                {plan.overBudget ? (
                  <p class="notice">
                    That budget is too tight for a full week of meals for {household}. The lowest-cost week we can make right now is about{" "}
                    <strong>{cur(plan.lowestPossible ?? plan.weeklyCost)}</strong>. Here it is.
                  </p>
                ) : (
                  <p class="plan-total">
                    Estimated <strong>{cur(plan.weeklyCost)}</strong> of your {cur(input.budget)} budget
                  </p>
                )}
                {input.usual != null && input.usual > plan.weeklyCost && (
                  <p class="savings">
                    Compared with your usual {cur(input.usual)}, you could save about <strong>{cur(input.usual - plan.weeklyCost)}</strong> this week (around{" "}
                    {cur((input.usual - plan.weeklyCost) * 52)} a year).
                  </p>
                )}
                <p class="small muted">
                  {household} · {STORES[input.store].label} · {plan.recipes.length} different recipes
                  {plan.starterCupboard > 0.5 && <> · starter cupboard if you need it: about {cur(plan.starterCupboard)}, lasts several weeks</>}
                </p>
                {plan.noRecipes.length > 0 && <p class="small">No recipes fit your choices for: {plan.noRecipes.map((m) => MEAL_LABELS[m]).join(", ")}.</p>}
                <div class="plan-actions no-print">
                  <button class="btn btn-primary btn-small" type="button" data-print>
                    Download PDF
                  </button>
                  <a class="btn btn-ghost btn-small" href={planQuery(input, { seed: input.seed + 1, picks: undefined })}>
                    Shuffle meals
                  </a>
                  <form method="post" action="/account/meal-plans/save" class="inline-form">
                    <CsrfField token={props.csrfToken} />
                    <input type="hidden" name="query" value={planQuery(input).split("?")[1]} />
                    <button class="btn btn-ghost btn-small" type="submit">
                      Remember my choices
                    </button>
                  </form>
                  <p class="hint">Allergies aren't saved, so please tick them each time.</p>
                </div>
              </div>

              <form method="post" action="/account/meal-plans/spend" class="card spend-card no-print">
                <CsrfField token={props.csrfToken} />
                <input type="hidden" name="query" value={planQuery(input).split("?")[1]} />
                <input type="hidden" name="planned" value={plan.weeklyCost.toFixed(2)} />
                <label for="mp-actual">
                  <strong>Done your shop?</strong> What did you actually pay?
                </label>
                <div class="spend-row">
                  <div class="input-prefix">
                    <span>{COUNTRIES[input.country].symbol}</span>
                    <input id="mp-actual" name="actual" type="number" inputmode="decimal" min={0} max={5000} step="0.01" required />
                  </div>
                  <button class="btn btn-ghost btn-small" type="submit">
                    Save
                  </button>
                </div>
                <p class="hint">Your real prices make your future plans more accurate, and keep a running total of what you've saved.</p>
                {props.spent && (
                  <p class="notice notice-ok" role="status">
                    Saved. Thank you.
                  </p>
                )}
                {props.spend.weeks > 0 && (
                  <p class="small">
                    You've logged {props.spend.weeks} week{props.spend.weeks === 1 ? "" : "s"}.
                    {props.spend.savedPence > 0 && (
                      <>
                        {" "}
                        Compared with your usual shop, you've spent about <strong>{money(props.spend.savedPence / 100, input.country)}</strong> less.
                      </>
                    )}
                    {Math.abs(props.spend.personalFactor - 1) >= 0.03 && (
                      <>
                        {" "}
                        Your plans now use your real prices (about {Math.round(Math.abs(props.spend.personalFactor - 1) * 100)}%{" "}
                        {props.spend.personalFactor > 1 ? "above" : "below"} our estimates).
                      </>
                    )}
                  </p>
                )}
              </form>

              <h2 class="plan-heading">The week at a glance</h2>
              <ol class="week">
                {DAYS.map((day, d) => (
                  <li class="day card">
                    <h3>{day}</h3>
                    <ul>
                      {plan.slots
                        .filter((s) => s.day === d)
                        .map((s) => (
                          <li>
                            <span class="meal-label">{MEAL_LABELS[s.meal]}</span> <a href={`#r-${s.recipe.id}`}>{s.recipe.name}</a>
                            {s.note && <span class="small muted"> ({s.note})</span>}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ol>

              <h2 class="plan-heading">Shopping list</h2>
              <form method="get" action="/account/meal-plans" class="card shopping">
                {Object.entries(planQueryFields(input)).map(([k, v]) => (
                  <input type="hidden" name={k} value={v} />
                ))}
                <input type="hidden" name="have" value="" />
                <h3 class="h4">To buy</h3>
                <ul class="shopping-list">
                  {toBuy.map((l) => (
                    <ShoppingItem line={l} cur={cur} />
                  ))}
                </ul>
                <h3 class="h4">Cupboard</h3>
                <p class="small muted">Tick what you already have, then update. Only what this week uses is counted in the total.</p>
                <ul class="shopping-list">
                  {cupboard.map((l) => (
                    <ShoppingItem line={l} cur={cur} />
                  ))}
                </ul>
                <button class="btn btn-ghost btn-small no-print" type="submit">
                  Update the total
                </button>
              </form>

              <h2 class="plan-heading">Recipes</h2>
              {plan.recipes.map((c) => (
                <RecipeCard recipe={c.recipe} times={c.times} scale={c.scale} portions={plan.portions} swaps={plan.swaps[c.recipe.id] ?? []} input={{ ...input, picks: allIds }} allIds={allIds} favourite={!!props.favourites?.includes(c.recipe.id)} csrfToken={props.csrfToken} photo={props.photos?.[c.recipe.id]} />
              ))}
              <Notes plan={plan} />
            </>
          )}
        </div>
      </section>
      <script src={assetUrl("/reader.js")} defer />
    </Layout>
  );
}

function ShoppingItem(props: { line: Plan["shopping"][number]; cur: (n: number) => string }) {
  const l = props.line;
  return (
    <li class={l.have ? "have" : undefined}>
      <label class="check">
        <input type="checkbox" name="have" value={l.key} checked={l.have} />
        <span>
          {l.label}
          {!l.cupboard && l.packs > 1 && <span class="muted"> × {l.packs}</span>}
        </span>
      </label>
      <span class="shopping-cost">{l.have ? "have it" : props.cur(l.cost)}</span>
    </li>
  );
}

/** The form fields that carry the plan's choices (everything except "have", which the checkboxes set). */
function planQueryFields(input: PlanInput): Record<string, string> {
  const q = new URLSearchParams(planQuery(input).split("?")[1]);
  q.delete("have");
  return Object.fromEntries(q.entries());
}
