import { publishedReviews, reviewableProducts, reviewProblem, submitReview } from "../services/reviews";
import { ReviewPage } from "../views/reviews";
import { priceBook, regionsFor } from "../lib/meal-plans/official";
import { loadOfficialPrices } from "../services/official-prices";
import { buildPlan, COUNTRIES, weekSeed } from "../lib/meal-plans/planner";
import { recipeById } from "../lib/meal-plans/recipes";
import { membershipCancelledEmail } from "../emails/automation";
import { sendEmail } from "../services/email";
import { setCancelAtPeriodEnd } from "../services/payments/stripe";
import { kitchenMembership, kitchenProduct, markCancelRequested } from "../services/subscriptions";
import { MembershipPage } from "../views/membership";
import { TeamDashboardPage } from "../views/team";
import { canUseTeam, logSession, teamDashboard, ukDay, weekStart } from "../services/team";
import { sessionForDay } from "../content/team-sessions";
import { setTradition, addDiary, addPlan, checkIn, deleteDiary, deletePlan, listDiary, moods, plansBetween, sessionsBetween, setPlanDone, validDay, wellbeingDataFor, addDays } from "../services/wellbeing";
import { DiaryPage, WeekPage } from "../views/wellbeing";
import { getProductsBySlugs, isOnSale } from "../services/products";
import { MEAL_PLANS_SLUG } from "../services/meal-plans";
import { friendStatus, setShowName } from "../services/kitchen-friends";
import { photoUrls } from "../services/recipe-photos";
import { canUseMealPlans, DEFAULT_PREFS, listFavourites, loadPrefs, readPlanInput, recordSpend, savePrefs, spendSummary, toggleFavourite } from "../services/meal-plans";
import { MealPlannerPage } from "../views/meal-plans";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { endSession, requireUser, startSession } from "../middleware/auth";
import { clientIp, rateLimit } from "../middleware/rate-limit";
import { affiliateSettings, affiliateSummary, getAffiliateByUser, joinAffiliateProgramme, setPayoutEmail } from "../services/affiliates";
import { changePassword, deleteAccount, exportUserData, looksLikeEmail, marketingOptedIn, passwordProblem, setMarketing, verifyUserPassword } from "../services/accounts";
import { canViewMedia, listLessons, listOwnedProgrammes, MODES, ownedProgrammeBySlug, setLessonDone, type Mode } from "../services/library";
import { AccountPage, ReaderPage } from "../views/account";
import { pageMeta } from "./meta";

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.use("/account", requireUser);
accountRoutes.use("/account/*", async (c, next) => (c.req.path === "/account/setup" ? next() : requireUser(c, next)));
accountRoutes.use("/media/*", requireUser);

const NOTICES: Record<string, string> = {
  welcome: "Your account is ready. Start with the full guide.",
  subscribed: "You're subscribed to news and new programmes.",
  unsubscribed: "You've been unsubscribed. You'll still get emails about your orders.",
  password: "Password changed. You've been logged out on other devices.",
  affiliate: "Your share link is ready.",
  payout: "Payout details saved.",
};

async function renderAccount(c: Context<AppEnv>, opts: { error?: string; status?: 200 | 401 | 422 } = {}) {
  const user = c.get("user")!;
  const noticeKey = Object.keys(NOTICES).find((k) => c.req.query(k) !== undefined);
  const programmes = await listOwnedProgrammes(c.env.DB, user.id);
  const settings = await affiliateSettings(c.env.DB);
  const affiliate = await getAffiliateByUser(c.env.DB, user.id);
  return c.html(
    <AccountPage
      meta={pageMeta(c, { title: "My account", description: "Your programmes and account.", path: "/account", noindex: true })}
      csrfToken={c.get("csrfToken")}
      user={user}
      programmes={programmes}
      marketing={await marketingOptedIn(c.env.DB, user.email)}
      affiliate={{
        csrfToken: c.get("csrfToken"),
        ratePercent: affiliate?.rate_percent ?? settings.ratePercent,
        holdDays: settings.holdDays,
        affiliate,
        summary: affiliate ? await affiliateSummary(c.env.DB, affiliate.id) : null,
        link: affiliate ? `${c.env.SITE_URL}/r/${affiliate.code}` : null,
        ownsProgramme: programmes.length > 0,
      }}
      notice={noticeKey ? NOTICES[noticeKey] : null}
      error={opts.error ?? null}
    />,
    opts.status ?? 200,
  );
}

accountRoutes.get("/account", (c) => renderAccount(c));

/** ?mode=guide|listen|points|sheet (older links used ?tab=full|quick). */
function readMode(value: string | undefined): Mode {
  if (value === "quick") return "points";
  return MODES.find((m) => m === value) ?? "guide";
}

// --- Budget meal plans ---

const MEAL_MULTI = ["allergens", "have", "picks", "exclude", "children", "style", "child", "size", "sizes"];

/** Reads the planner's choices from a query string, joining repeated fields (checkboxes). */
function mealQuery(params: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = MEAL_MULTI.includes(key) ? all.flatMap((v) => v.split(",")) : all[all.length - 1];
  }
  return out;
}

// --- Reviews ---

const reviewMeta = (c: Context<AppEnv>) => pageMeta(c, { title: "Leave a review", description: "Tell us how it's going.", path: "/account/review", noindex: true });

accountRoutes.get("/account/review", async (c) => {
  const user = c.get("user")!;
  return c.html(<ReviewPage meta={reviewMeta(c)} csrfToken={c.get("csrfToken")} products={await reviewableProducts(c.env.DB, user.id)} sent={c.req.query("sent") !== undefined} />);
});

accountRoutes.post("/account/review", rateLimit("review", 5, 3600), async (c) => {
  const user = c.get("user")!;
  const form = await c.req.parseBody();
  const products = await reviewableProducts(c.env.DB, user.id);
  const values = {
    productId: String(form.product ?? ""),
    rating: String(form.rating ?? ""),
    body: String(form.body ?? "").trim(),
    displayName: String(form.display_name ?? "").trim(),
    mayPublish: form.may_publish === "yes",
  };
  const input = { productId: values.productId ? Number(values.productId) : null, rating: Number(values.rating), body: values.body, displayName: values.displayName, mayPublish: values.mayPublish };
  const error = products.length === 0 ? "Reviews are for members with a programme." : reviewProblem(input);
  if (error) return c.html(<ReviewPage meta={reviewMeta(c)} csrfToken={c.get("csrfToken")} products={products} error={error} values={values} />, 422);
  await submitReview(c.env.DB, user.id, input);
  return c.redirect("/account/review?sent", 303);
});

accountRoutes.get("/account/programmes/meal-plans", (c) => c.redirect("/account/meal-plans", 302));
accountRoutes.get("/account/programmes/teams", (c) => c.redirect("/account/team", 302));

// --- Team wellbeing: the employee dashboard (business package) ---

accountRoutes.get("/account/team", async (c) => {
  const user = c.get("user")!;
  if (user.role !== "admin" && !(await canUseTeam(c.env.DB, user.id))) return c.redirect("/account", 302);
  const d = await teamDashboard(c.env.DB, user.id);
  return c.html(
    <TeamDashboardPage
      meta={pageMeta(c, { title: "Your wellbeing dashboard", description: "Today's session, your courses, the meal planner and your progress.", path: "/account/team", noindex: true })}
      csrfToken={c.get("csrfToken")}
      name={user.name ?? null}
      d={d}
      session={sessionForDay(d.today)}
      needWordsConsent={c.req.query("words") === "consent"}
    />,
  );
});

// Stage 2: mood check-in, the week planner (calendar) and the diary. All private to the employee.
const teamOnly = async (c: Context<AppEnv>) => {
  const user = c.get("user")!;
  return user.role === "admin" || (await canUseTeam(c.env.DB, user.id)) ? user : null;
};

accountRoutes.post("/account/team/mood", rateLimit("team-mood", 30, 3600), async (c) => {
  const user = await teamOnly(c);
  if (!user) return c.redirect("/account", 303);
  await checkIn(c.env.DB, user.id, ukDay(), Number((await c.req.parseBody()).mood));
  return c.redirect("/account/team#mood", 303);
});

accountRoutes.post("/account/team/words", rateLimit("team-words", 20, 3600), async (c) => {
  const user = await teamOnly(c);
  if (!user) return c.redirect("/account", 303);
  const f = await c.req.parseBody();
  const ok = await setTradition(c.env.DB, user, String(f.tradition ?? "none"), f.consent === "yes");
  return c.redirect(ok ? "/account/team#thought" : "/account/team?words=consent#thought", 303);
});

accountRoutes.get("/account/team/week", async (c) => {
  const user = await teamOnly(c);
  if (!user) return c.redirect("/account", 302);
  const today = ukDay();
  const asked = c.req.query("from") ?? "";
  const from = validDay(asked) ? weekStart(asked) : weekStart(today);
  const to = addDays(from, 6);
  return c.html(
    <WeekPage
      meta={pageMeta(c, { title: "My week", description: "Plan your sessions, courses and meals for the week.", path: "/account/team/week", noindex: true })}
      csrfToken={c.get("csrfToken")}
      from={from}
      today={today}
      plans={await plansBetween(c.env.DB, user.id, from, to)}
      sessions={await sessionsBetween(c.env.DB, user.id, from, to)}
      moods={await moods(c.env.DB, user.id, from, to)}
      error={c.req.query("error") ?? null}
    />,
  );
});

accountRoutes.post("/account/team/plan", rateLimit("team-plan", 60, 3600), async (c) => {
  const user = await teamOnly(c);
  if (!user) return c.redirect("/account", 303);
  const f = await c.req.parseBody();
  const day = String(f.day ?? "");
  const back = `/account/team/week?from=${validDay(day) ? weekStart(day) : weekStart(ukDay())}`;
  if (f.action === "add") {
    const error = await addPlan(c.env.DB, user.id, { day, time: String(f.time ?? ""), kind: String(f.kind ?? ""), title: String(f.title ?? "") });
    if (error) return c.redirect(`${back}&error=${encodeURIComponent(error)}#add`, 303);
  } else if (f.action === "done" || f.action === "undo") await setPlanDone(c.env.DB, user.id, Number(f.id), f.action === "done");
  else if (f.action === "delete") await deletePlan(c.env.DB, user.id, Number(f.id));
  return c.redirect(`${back}#d-${day}`, 303);
});

accountRoutes.get("/account/team/diary", async (c) => {
  const user = await teamOnly(c);
  if (!user) return c.redirect("/account", 302);
  return c.html(
    <DiaryPage
      meta={pageMeta(c, { title: "My diary", description: "Your private diary.", path: "/account/team/diary", noindex: true })}
      csrfToken={c.get("csrfToken")}
      today={ukDay()}
      entries={await listDiary(c.env, user.id)}
      available={!!c.env.ADMIN_ENC_KEY}
      notice={c.req.query("saved") !== undefined ? "Saved. Only you can see it." : null}
    />,
  );
});

accountRoutes.post("/account/team/diary", rateLimit("team-diary", 60, 3600), async (c) => {
  const user = await teamOnly(c);
  if (!user) return c.redirect("/account", 303);
  const f = await c.req.parseBody();
  if (f.action === "delete") {
    await deleteDiary(c.env.DB, user.id, Number(f.id));
    return c.redirect("/account/team/diary", 303);
  }
  const result = await addDiary(c.env, user.id, String(f.day ?? ukDay()), String(f.body ?? ""));
  return c.redirect(result === "saved" ? "/account/team/diary?saved" : "/account/team/diary", 303);
});

accountRoutes.post("/account/team/done", rateLimit("team-done", 30, 3600), async (c) => {
  const user = c.get("user")!;
  if (user.role !== "admin" && !(await canUseTeam(c.env.DB, user.id))) return c.redirect("/account", 303);
  await logSession(c.env.DB, user.id, String((await c.req.parseBody()).session ?? ""));
  return c.redirect("/account/team#today", 303);
});

accountRoutes.get("/account/meal-plans", async (c) => {
  const user = c.get("user")!;
  if (user.role !== "admin" && !(await canUseMealPlans(c.env.DB, user.id))) return c.redirect("/programmes/meal-plans", 302);
  const params = new URL(c.req.url).searchParams;
  const prefs = await loadPrefs(c.env.DB, user.id);
  const hasSaved = prefs !== DEFAULT_PREFS;
  const spend = await spendSummary(c.env.DB, user.id);
  const prices = await loadOfficialPrices(c.env.DB);
  // A fresh plan each week unless they've shuffled or swapped.
  if (!params.has("seed")) params.set("seed", String(weekSeed()));
  const chosen = readPlanInput(mealQuery(params), prefs);
  const favourites = await listFavourites(c.env.DB, user.id);
  const input = { ...chosen, favourites, personalFactor: spend.personalFactor, book: priceBook(prices, chosen.country, chosen.region) };
  const show = params.has("submitted") || hasSaved;
  const membership = await kitchenMembership(c.env.DB, user.email);
  return c.html(
    <MealPlannerPage
      meta={pageMeta(c, { title: "Your meal plan", description: "Budget meal plans with recipes and a shopping list.", path: "/account/meal-plans", noindex: true })}
      csrfToken={c.get("csrfToken")}
      input={input}
      plan={show ? buildPlan(input) : null}
      saved={params.has("saved")}
      spent={params.has("spent")}
      spend={spend}
      regions={{ uk: regionsFor(prices, "uk"), us: regionsFor(prices, "us"), ca: regionsFor(prices, "ca") }}
      favourites={favourites}
      hasMembership={!!membership}
      hasTeam={await canUseTeam(c.env.DB, user.id)}
      view={c.req.query("view") ?? null}
      photos={await photoUrls(c.env.DB)}
    />,
  );
});

accountRoutes.post("/account/meal-plans/favourite", async (c) => {
  const user = c.get("user")!;
  if (user.role !== "admin" && !(await canUseMealPlans(c.env.DB, user.id))) return c.redirect("/kitchen", 303);
  const form = await c.req.parseBody();
  const recipe = recipeById(String(form.recipe ?? ""));
  const query = new URLSearchParams(String(form.query ?? ""));
  if (recipe) await toggleFavourite(c.env.DB, user.id, recipe.id);
  return c.redirect(`/account/meal-plans?${query.toString()}${recipe ? `#r-${recipe.id}` : ""}`, 303);
});

// --- Kitchen membership: see it, cancel it (or change your mind) ---

const membershipMeta = (c: Context<AppEnv>) => pageMeta(c, { title: "Your Kitchen membership", description: "Manage your membership.", path: "/account/membership", noindex: true });

accountRoutes.get("/account/membership", async (c) => {
  const user = c.get("user")!;
  const sub = await kitchenMembership(c.env.DB, user.email);
  const monthly = await kitchenProduct(c.env.DB);
  const friends = sub ? await friendStatus(c.env.DB, user.email) : null;
  const [kitchen] = await getProductsBySlugs(c.env.DB, [MEAL_PLANS_SLUG]);
  const joinPence = kitchen && isOnSale(kitchen) ? kitchen.price_pence : null;
  return c.html(
    <MembershipPage
      meta={membershipMeta(c)}
      csrfToken={c.get("csrfToken")}
      sub={sub}
      monthly={monthly}
      done={c.req.query("done") ?? null}
      friends={friends && { ...friends, url: `${c.env.SITE_URL}/kitchen/friend/${friends.code}`, joinPence: joinPence ?? null }}
    />,
  );
});

accountRoutes.post("/account/membership/friend-name", async (c) => {
  const user = c.get("user")!;
  await setShowName(c.env.DB, user.email, (await c.req.parseBody()).show === "yes");
  return c.redirect("/account/membership#friends", 303);
});

accountRoutes.post("/account/membership", rateLimit("membership", 10, 3600), async (c) => {
  const user = c.get("user")!;
  const sub = await kitchenMembership(c.env.DB, user.email);
  const cancel = (await c.req.parseBody()).action !== "resume";
  if (!sub || !c.env.STRIPE_SECRET_KEY) return c.redirect("/account/membership", 303);
  try {
    await setCancelAtPeriodEnd(c.env.STRIPE_SECRET_KEY, sub.stripe_subscription_id, cancel);
  } catch (err) {
    console.error("Membership change failed", String(err));
    return c.redirect("/account/membership?done=error", 303);
  }
  await markCancelRequested(c.env.DB, sub.id, cancel);
  if (cancel) await sendEmail(c.env, membershipCancelledEmail({ siteName: c.env.SITE_NAME, to: user.email, until: sub.current_period_end, url: `${c.env.SITE_URL}/account/membership` }));
  return c.redirect(`/account/membership?done=${cancel ? "cancelled" : "resumed"}`, 303);
});

accountRoutes.post("/account/meal-plans/spend", rateLimit("meal-spend", 30, 3600), async (c) => {
  const user = c.get("user")!;
  if (user.role !== "admin" && !(await canUseMealPlans(c.env.DB, user.id))) return c.redirect("/programmes/meal-plans", 303);
  const form = await c.req.parseBody();
  const query = new URLSearchParams(String(form.query ?? ""));
  const input = readPlanInput(mealQuery(query));
  const pence = (v: unknown) => Math.round(Number(v) * 100);
  const actual = pence(form.actual);
  const planned = pence(form.planned);
  if (Number.isFinite(actual) && actual >= 0 && actual <= 500_000 && Number.isFinite(planned) && planned > 0) {
    await recordSpend(c.env.DB, user.id, { plannedPence: planned, usualPence: input.usual ? input.usual * 100 : null, actualPence: actual, currency: COUNTRIES[input.country].currency.toLowerCase() });
  }
  query.set("spent", "1");
  return c.redirect(`/account/meal-plans?${query.toString()}`, 303);
});

accountRoutes.post("/account/meal-plans/save", async (c) => {
  const user = c.get("user")!;
  if (user.role !== "admin" && !(await canUseMealPlans(c.env.DB, user.id))) return c.redirect("/programmes/meal-plans", 303);
  const query = new URLSearchParams(String((await c.req.parseBody()).query ?? ""));
  const input = readPlanInput(mealQuery(query));
  await savePrefs(c.env.DB, user.id, input);
  query.set("saved", "1");
  return c.redirect(`/account/meal-plans?${query.toString()}`, 303);
});

accountRoutes.get("/account/programmes/:slug", async (c) => {
  const user = c.get("user")!;
  const programme = await ownedProgrammeBySlug(c.env.DB, user.id, c.req.param("slug"));
  if (!programme) return c.notFound();
  const mode = readMode(c.req.query("mode") ?? c.req.query("tab"));
  const item = Number.parseInt(c.req.query("item") ?? "1", 10);
  return c.html(
    <ReaderPage
      meta={pageMeta(c, { title: programme.title, description: programme.title, path: `/account/programmes/${programme.slug}`, noindex: true })}
      csrfToken={c.get("csrfToken")}
      programme={programme}
      mode={mode}
      lessons={await listLessons(c.env.DB, user.id, programme.id)}
      item={Number.isFinite(item) ? item : 1}
    />,
  );
});

accountRoutes.post("/account/programmes/:slug/progress", async (c) => {
  const user = c.get("user")!;
  const programme = await ownedProgrammeBySlug(c.env.DB, user.id, c.req.param("slug"));
  if (!programme) return c.notFound();
  const form = await c.req.parseBody();
  const lessonId = Number(form.lesson);
  const mode = readMode(String(form.mode ?? form.tab ?? ""));
  if (Number.isInteger(lessonId)) await setLessonDone(c.env.DB, user.id, programme.id, lessonId, form.done === "yes");
  const item = Number.parseInt(String(form.item ?? ""), 10);
  if (mode === "guide" && Number.isInteger(item) && item > 0) return c.redirect(`/account/programmes/${programme.slug}?mode=guide&item=${item}`, 303);
  return c.redirect(`/account/programmes/${programme.slug}?mode=${mode}#lesson-${lessonId}`, 303);
});

accountRoutes.post("/account/marketing", async (c) => {
  const user = c.get("user")!;
  const on = (await c.req.parseBody()).marketing === "yes";
  await setMarketing(c.env.DB, user, on, "account-page");
  return c.redirect(`/account?${on ? "subscribed" : "unsubscribed"}`, 303);
});

accountRoutes.post("/account/password", rateLimit("change-password", 10, 900), async (c) => {
  const user = c.get("user")!;
  const form = await c.req.parseBody();
  const next = String(form.password ?? "");
  const problem = passwordProblem(next, String(form.confirm ?? ""), user.email);
  if (problem) return renderAccount(c, { error: problem, status: 422 });
  if (!(await changePassword(c.env.DB, user.id, String(form.current ?? ""), next))) {
    return renderAccount(c, { error: "Your current password wasn't right.", status: 401 });
  }
  // changePassword logs out every session, including this one; start a fresh one here.
  await startSession(c, user);
  return c.redirect("/account?password", 303);
});

accountRoutes.post("/account/affiliate/join", async (c) => {
  const user = c.get("user")!;
  if ((await c.req.parseBody()).terms !== "yes") return c.redirect("/account#share", 303);
  if ((await affiliateSettings(c.env.DB)).ratePercent == null) return c.redirect("/account#share", 303);
  const affiliate = await joinAffiliateProgramme(c.env.DB, user);
  return c.redirect(affiliate ? "/account?affiliate#share" : "/account#share", 303);
});

accountRoutes.post("/account/affiliate/payout", async (c) => {
  const user = c.get("user")!;
  const email = String((await c.req.parseBody()).payout_email ?? "").trim().toLowerCase();
  if (email && !looksLikeEmail(email)) return renderAccount(c, { error: "That payout email doesn't look right.", status: 422 });
  await setPayoutEmail(c.env.DB, user.id, email);
  return c.redirect("/account?payout#share", 303);
});

accountRoutes.get("/account/export", async (c) => {
  const user = c.get("user")!;
  const data = { ...(await exportUserData(c.env.DB, user.id)), ...(await wellbeingDataFor(c.env, user.id)) };
  c.header("Content-Disposition", `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("Cache-Control", "no-store");
  return c.json(data);
});

accountRoutes.post("/account/delete", rateLimit("delete-account", 5, 900), async (c) => {
  const user = c.get("user")!;
  if (!(await verifyUserPassword(c.env.DB, user.id, String((await c.req.parseBody()).password ?? "")))) {
    return renderAccount(c, { error: "That password wasn't right, so your account has not been deleted.", status: 401 });
  }
  await deleteAccount(c.env.DB, user.id, { userId: user.id, ip: clientIp(c.req.raw) });
  await endSession(c);
  return c.redirect("/?deleted=1", 303);
});

// Programme images: only members who own the programme (or admins) can load them.
accountRoutes.get("/media/:key{.+}", async (c) => {
  const user = c.get("user")!;
  const key = c.req.param("key");
  if (user.role !== "admin" && !(await canViewMedia(c.env.DB, user.id, key))) return c.notFound();
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.notFound();
  c.header("Content-Type", obj.httpMetadata?.contentType ?? "application/octet-stream");
  c.header("Cache-Control", "private, max-age=3600");
  return c.body(obj.body);
});
