import { Hono, type Context } from "hono";
import { linkEmail } from "../emails/templates";
import type { AppEnv } from "../env";
import { youtubeId } from "../lib/youtube";
import { requireAdmin } from "../middleware/auth";
import { clientIp } from "../middleware/rate-limit";
import { deleteAccount, looksLikeEmail } from "../services/accounts";
import {
  bundleItemIds,
  createLesson,
  createProduct,
  duplicateLesson,
  duplicateProduct,
  getLesson,
  getProduct,
  listLessonsAdmin,
  listProductsAdmin,
  moveLesson,
  restoreLessonRevision,
  restoreProductRevision,
  setMonthlyPrice,
  setBundleItems,
  storeImage,
  updateLesson,
  updateProduct,
  validateProduct,
  type Actor,
  type LessonInput,
} from "../services/admin-content";
import { affiliateSettings, listAffiliatesAdmin, recordPayout, setPartnerTerms, saveAffiliateSettings, setAffiliateStatus } from "../services/affiliates";
import { usageThisMonth } from "../services/automation";
import { findPlaceholders, launchChecks } from "../services/launch";
import { sitemapPaths } from "./public";
import { getCampaign, listCampaigns, marketingAudience, saveCampaign, sendCampaign, sendCampaignTest } from "../services/campaigns";
import { dashboardNumbers, getOrderDetail, grantAccess, listCustomers, listOrders, revokeOrderAccess, toCsv, userIdByEmail } from "../services/admin-ops";
import { listAudit, recordAudit } from "../services/audit";
import { backupDatabase, listBackups } from "../services/backup";
import { listEmailLog, sendEmail } from "../services/email";
import { refundPaymentIntent } from "../services/payments/stripe";
import { listProducts } from "../services/products";
import { listRevisions } from "../services/revisions";
import { loadSettings, saveWording, WORDING } from "../services/site-content";
import { memberSavingsSummary } from "../services/meal-plans";
import { listReviewsAdmin, moderateReview } from "../services/reviews";
import { loadOfficialPrices, refreshOfficialPrices } from "../services/official-prices";
import { CONTACT_EMAIL_KEY, listContactMessages, markContactHandled } from "../services/contact";
import { statsSummary } from "../services/stats";
import type { AdminMeta } from "../views/admin/layout";
import {
  ActivityPage,
  AffiliatesAdminPage,
  MessagesAdminPage,
  ReviewsAdminPage,
  CampaignEditPage,
  CampaignsPage,
  LaunchPage,
  BackupsPage,
  CustomersPage,
  DashboardPage,
  EmailsPage,
  LessonEditPage,
  OrderDetailPage,
  OrdersPage,
  ProductEditPage,
  ProgrammesAdminPage,
  StatsPage,
  WordingPage,
} from "../views/admin/pages";
import { adminMeta } from "./admin-login";
import { codeProblem, createAccessCode, listCodesWithResults, setCodeStatus, type CodeInput } from "../services/access-codes";
import { CodesAdminPage } from "../views/admin/codes";

export const adminRoutes = new Hono<AppEnv>();

// Everything below needs a two-step-verified admin session. The login pages are separate.
adminRoutes.use("/admin", requireAdmin);
adminRoutes.use("/admin/*", async (c, next) => (c.req.path.startsWith("/admin/login") || c.req.path === "/admin/logout" ? next() : requireAdmin(c, next)));

const actor = (c: Context<AppEnv>): Actor => ({ userId: c.get("user")!.id, ip: clientIp(c.req.raw) });
const FLASHES: Record<string, string> = {
  saved: "Saved.",
  created: "Created.",
  restored: "Earlier version restored. (The version you replaced is in the history too.)",
  duplicated: "Copy created as a draft.",
  refund: "Refund requested from Stripe. Access is removed when Stripe confirms (usually within a minute).",
  revoked: "Access removed.",
  granted: "Access given, and they've been emailed.",
  deleted: "Account deleted.",
  backup: "Backup complete.",
  payout: "Payout recorded. Their commission is marked as paid.",
  nopayout: "Nothing to pay: the amount owed is below the minimum.",
  tested: "Test email sent to you. Check your inbox.",
  sent: "Campaign sent.",
};
const meta = (c: Context<AppEnv>, title: string, extra: Partial<AdminMeta> = {}) => adminMeta(c, title, { flash: FLASHES[c.req.query("done") ?? ""] ?? null, ...extra });
const back = (c: Context<AppEnv>, path: string, done: keyof typeof FLASHES) => c.redirect(`${path}${path.includes("?") ? "&" : "?"}done=${done}`, 303);
const idParam = (c: Context<AppEnv>, name = "id") => {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 ? n : 0;
};

adminRoutes.get("/admin", async (c) => c.html(<DashboardPage meta={meta(c, "Dashboard")} n={await dashboardNumbers(c.env.DB)} usage={await usageThisMonth(c.env.DB)} />));

// --- Programmes and bundles ---

adminRoutes.get("/admin/programmes", async (c) => c.html(<ProgrammesAdminPage meta={meta(c, "Programmes")} products={await listProductsAdmin(c.env.DB)} />));

adminRoutes.post("/admin/programmes", async (c) => {
  const form = await c.req.parseBody();
  const title = String(form.title ?? "").trim();
  if (!title) return c.redirect("/admin/programmes", 303);
  const id = await createProduct(c.env.DB, { title, kind: form.kind === "bundle" ? "bundle" : "programme" }, actor(c));
  return back(c, `/admin/programmes/${id}`, "created");
});

async function renderProduct(c: Context<AppEnv>, id: number, error?: string) {
  const product = await getProduct(c.env.DB, id);
  if (!product) return c.notFound();
  return c.html(
    <ProductEditPage
      meta={meta(c, product.title, { error: error ?? null })}
      product={product}
      lessons={await listLessonsAdmin(c.env.DB, id)}
      programmes={(await listProducts(c.env.DB)).filter((p) => p.kind === "programme" && p.status !== "archived")}
      bundleItems={await bundleItemIds(c.env.DB, id)}
      history={await listRevisions(c.env.DB, "product", id)}
    />,
    error ? 422 : 200,
  );
}

adminRoutes.get("/admin/programmes/:id", (c) => renderProduct(c, idParam(c)));

adminRoutes.post("/admin/programmes/:id", async (c) => {
  const id = idParam(c);
  const form = await c.req.parseBody();
  const { value, error } = validateProduct({ title: String(form.title ?? ""), price: String(form.price ?? ""), status: String(form.status ?? ""), sortOrder: String(form.sort_order ?? "0") });
  if (!value) return renderProduct(c, id, error);
  if (!(await updateProduct(c.env.DB, id, value, actor(c)))) return c.notFound();
  return back(c, `/admin/programmes/${id}`, "saved");
});

adminRoutes.post("/admin/programmes/:id/monthly", async (c) => {
  const id = idParam(c);
  const raw = String((await c.req.parseBody()).monthly ?? "").replace(/[£,\s]/g, "");
  const n = Number(raw);
  if (raw && (!Number.isFinite(n) || n <= 0 || n > 1000)) return renderProduct(c, id, "Monthly price must be in pounds, e.g. 2.99, or empty.");
  const pence = raw ? Math.round(n * 100) : null;
  await setMonthlyPrice(c.env.DB, id, pence, actor(c));
  return back(c, `/admin/programmes/${id}`, "saved");
});

adminRoutes.post("/admin/programmes/:id/bundle", async (c) => {
  const id = idParam(c);
  const items = (await c.req.parseBody({ all: true })).items;
  const ids = (Array.isArray(items) ? items : items ? [items] : []).map(Number).filter(Number.isInteger);
  await setBundleItems(c.env.DB, id, ids, actor(c));
  return back(c, `/admin/programmes/${id}`, "saved");
});

adminRoutes.post("/admin/programmes/:id/duplicate", async (c) => {
  const newId = await duplicateProduct(c.env.DB, idParam(c), actor(c));
  return newId ? back(c, `/admin/programmes/${newId}`, "duplicated") : c.notFound();
});

adminRoutes.post("/admin/programmes/:id/restore/:rev", async (c) => {
  const id = await restoreProductRevision(c.env.DB, idParam(c, "rev"), actor(c));
  return id ? back(c, `/admin/programmes/${id}`, "restored") : c.notFound();
});

// --- Lessons (sections of a programme) ---

async function readLessonForm(c: Context<AppEnv>, existingImage: string | null): Promise<{ input?: LessonInput; error?: string; videoInput: string }> {
  const form = await c.req.parseBody();
  const videoInput = String(form.video ?? "").trim();
  const title = String(form.title ?? "").trim().slice(0, 200);
  if (!title) return { error: "Give the section a title.", videoInput };
  const yt = videoInput ? youtubeId(videoInput) : null;
  if (videoInput && !yt) return { error: "That doesn't look like a YouTube link. Copy it from YouTube's Share button.", videoInput };
  let imageKey: string | null | undefined = undefined;
  const file = form.image;
  if (file instanceof File && file.size > 0) {
    const stored = await storeImage(c.env.MEDIA, file);
    if (stored.error) return { error: stored.error, videoInput };
    imageKey = stored.key;
  } else if (form.remove_image === "yes") imageKey = null;
  else imageKey = existingImage;
  const status = (["draft", "published", "archived"] as const).find((s) => s === form.status) ?? "draft";
  const text = (name: string, max: number) => String(form[name] ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max) || null;
  return {
    videoInput,
    input: {
      tab: form.tab === "quick" ? "quick" : "full",
      title,
      body: String(form.body ?? "").replace(/\r\n?/g, "\n").slice(0, 100_000),
      youtube_id: yt,
      image_key: imageKey,
      image_alt: String(form.image_alt ?? "").trim().slice(0, 200) || null,
      status,
      kind: form.kind === "exercise" ? "exercise" : "section",
      stage: text("stage", 120),
      starting_position: text("starting_position", 100_000),
      conducting: text("conducting", 100_000),
      key_points: text("key_points", 20_000),
      recommended_time: text("recommended_time", 80),
      sheet_line: text("sheet_line", 160),
      watch_for: text("watch_for", 20_000),
      levels: text("levels", 50_000),
    },
  };
}

adminRoutes.get("/admin/lessons/new", async (c) => {
  const product = await getProduct(c.env.DB, Number(c.req.query("product")));
  if (!product || product.kind !== "programme") return c.notFound();
  return c.html(<LessonEditPage meta={meta(c, "New section")} product={product} lesson={{ tab: c.req.query("tab") === "quick" ? "quick" : "full" }} history={[]} />);
});

adminRoutes.post("/admin/lessons/new", async (c) => {
  const product = await getProduct(c.env.DB, Number(c.req.query("product")));
  if (!product || product.kind !== "programme") return c.notFound();
  const { input, error, videoInput } = await readLessonForm(c, null);
  if (!input) {
    const form = await c.req.parseBody();
    return c.html(
      <LessonEditPage meta={meta(c, "New section", { error })} product={product} lesson={{ tab: form.tab === "quick" ? "quick" : "full", title: String(form.title ?? ""), body: String(form.body ?? "") }} history={[]} videoInput={videoInput} />,
      422,
    );
  }
  const id = await createLesson(c.env.DB, product.id, input, actor(c));
  return back(c, `/admin/lessons/${id}`, "created");
});

adminRoutes.get("/admin/lessons/:id", async (c) => {
  const lesson = await getLesson(c.env.DB, idParam(c));
  const product = lesson && (await getProduct(c.env.DB, lesson.product_id));
  if (!lesson || !product) return c.notFound();
  return c.html(<LessonEditPage meta={meta(c, lesson.title)} product={product} lesson={lesson} history={await listRevisions(c.env.DB, "lesson", lesson.id)} />);
});

adminRoutes.post("/admin/lessons/:id", async (c) => {
  const lesson = await getLesson(c.env.DB, idParam(c));
  const product = lesson && (await getProduct(c.env.DB, lesson.product_id));
  if (!lesson || !product) return c.notFound();
  const { input, error, videoInput } = await readLessonForm(c, lesson.image_key);
  if (!input) {
    const form = await c.req.parseBody();
    return c.html(
      <LessonEditPage meta={meta(c, lesson.title, { error })} product={product} lesson={{ ...lesson, title: String(form.title ?? lesson.title), body: String(form.body ?? lesson.body) }} history={await listRevisions(c.env.DB, "lesson", lesson.id)} videoInput={videoInput} />,
      422,
    );
  }
  await updateLesson(c.env.DB, lesson.id, input, actor(c));
  return back(c, `/admin/lessons/${lesson.id}`, "saved");
});

adminRoutes.post("/admin/lessons/:id/move", async (c) => {
  const lesson = await getLesson(c.env.DB, idParam(c));
  if (!lesson) return c.notFound();
  await moveLesson(c.env.DB, lesson.id, (await c.req.parseBody()).direction === "up" ? "up" : "down", actor(c));
  return c.redirect(`/admin/programmes/${lesson.product_id}`, 303);
});

adminRoutes.post("/admin/lessons/:id/duplicate", async (c) => {
  const id = await duplicateLesson(c.env.DB, idParam(c), actor(c));
  return id ? back(c, `/admin/lessons/${id}`, "duplicated") : c.notFound();
});

adminRoutes.post("/admin/lessons/:id/restore/:rev", async (c) => {
  const id = await restoreLessonRevision(c.env.DB, idParam(c, "rev"), actor(c));
  return id ? back(c, `/admin/lessons/${id}`, "restored") : c.notFound();
});

// --- Orders, refunds, free access ---

adminRoutes.get("/admin/orders", async (c) => {
  const q = c.req.query("q") ?? "";
  return c.html(<OrdersPage meta={meta(c, "Orders")} orders={await listOrders(c.env.DB, q)} q={q} products={(await listProducts(c.env.DB)).filter((p) => p.status !== "archived")} />);
});

adminRoutes.get("/admin/orders/:publicId", async (c) => {
  const detail = await getOrderDetail(c.env.DB, c.req.param("publicId"));
  if (!detail) return c.notFound();
  return c.html(<OrderDetailPage meta={meta(c, `Order ${detail.order.public_id}`)} detail={detail} canRefund={!!c.env.STRIPE_SECRET_KEY && !!detail.order.stripe_payment_intent && detail.order.total_pence > 0} />);
});

adminRoutes.post("/admin/orders/:publicId/refund", async (c) => {
  const detail = await getOrderDetail(c.env.DB, c.req.param("publicId"));
  if (!detail) return c.notFound();
  const { order } = detail;
  const path = `/admin/orders/${order.public_id}`;
  if ((await c.req.parseBody()).confirm !== "yes") return c.redirect(path, 303);
  if (order.status !== "paid" || !order.stripe_payment_intent || !c.env.STRIPE_SECRET_KEY) return c.redirect(path, 303);
  try {
    await refundPaymentIntent(c.env.STRIPE_SECRET_KEY, order.stripe_payment_intent);
  } catch (err) {
    return c.html(<OrderDetailPage meta={meta(c, `Order ${order.public_id}`, { error: `Stripe said: ${String(err instanceof Error ? err.message : err)}` })} detail={detail} canRefund />, 502);
  }
  await recordAudit(c.env.DB, { ...actorAudit(c), action: "order.refund", targetType: "order", targetId: order.public_id, detail: { pence: order.total_pence } });
  return back(c, path, "refund");
});

const actorAudit = (c: Context<AppEnv>) => ({ actorUserId: c.get("user")!.id, ip: clientIp(c.req.raw) });

adminRoutes.post("/admin/orders/:publicId/revoke", async (c) => {
  const detail = await getOrderDetail(c.env.DB, c.req.param("publicId"));
  if (!detail) return c.notFound();
  if ((await c.req.parseBody()).confirm === "yes") await revokeOrderAccess(c.env.DB, detail.order.id, actor(c));
  return back(c, `/admin/orders/${detail.order.public_id}`, "revoked");
});

adminRoutes.post("/admin/access", async (c) => {
  const form = await c.req.parseBody();
  const email = String(form.email ?? "").trim().toLowerCase();
  if (!looksLikeEmail(email)) return c.redirect("/admin/orders", 303);
  const result = await grantAccess(c.env.DB, email, Number(form.product), actor(c));
  if (!result) return c.notFound();
  const url = result.setupToken ? `${c.env.SITE_URL}/account/setup?token=${result.setupToken}` : `${c.env.SITE_URL}/login`;
  await sendEmail(c.env, { ...linkEmail({ siteName: c.env.SITE_NAME, to: email, purpose: "setup", url }), template: "access_granted", subject: "You've been given a programme" });
  return back(c, `/admin/orders/${result.orderPublicId}`, "granted");
});

// --- Customers ---

adminRoutes.get("/admin/customers", async (c) => {
  const q = c.req.query("q") ?? "";
  return c.html(<CustomersPage meta={meta(c, "Customers")} customers={await listCustomers(c.env.DB, q)} q={q} />);
});

adminRoutes.get("/admin/customers.csv", async (c) => {
  const rows = await listCustomers(c.env.DB, c.req.query("q") ?? "", 100_000);
  await recordAudit(c.env.DB, { ...actorAudit(c), action: "customers.export", detail: { rows: rows.length } });
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(toCsv(rows.map((r) => ({ ...r, spent: (r.spent_pence / 100).toFixed(2) })), ["email", "name", "has_account", "programmes", "spent", "first_seen"]));
});

adminRoutes.post("/admin/customers/delete", async (c) => {
  const form = await c.req.parseBody();
  if (form.confirm !== "yes") return c.redirect("/admin/customers", 303);
  const id = await userIdByEmail(c.env.DB, String(form.email ?? ""));
  if (id) await deleteAccount(c.env.DB, id, { userId: c.get("user")!.id, ip: clientIp(c.req.raw) });
  return back(c, "/admin/customers", "deleted");
});

// --- Site wording ---

adminRoutes.get("/admin/wording", async (c) => c.html(<WordingPage meta={meta(c, "Site wording")} fields={WORDING} values={await loadSettings(c.env.DB)} />));

adminRoutes.post("/admin/wording", async (c) => {
  const form = await c.req.parseBody();
  const values = Object.fromEntries(WORDING.filter((f) => typeof form[f.key] === "string").map((f) => [f.key, String(form[f.key])]));
  await saveWording(c.env.DB, values, actor(c));
  return back(c, "/admin/wording", "saved");
});

// --- System pages ---

adminRoutes.get("/admin/stats", async (c) =>
  c.html(<StatsPage meta={meta(c, "Stats")} s={await statsSummary(c.env.DB)} meals={await memberSavingsSummary(c.env.DB)} prices={await loadOfficialPrices(c.env.DB)} />),
);

adminRoutes.post("/admin/meal-prices/refresh", async (c) => {
  const result = await refreshOfficialPrices(c.env, fetch, true);
  await recordAudit(c.env.DB, { ...actorAudit(c), action: "meal-prices.refresh", detail: result });
  return back(c, "/admin/stats", "saved");
});
adminRoutes.get("/admin/activity", async (c) => c.html(<ActivityPage meta={meta(c, "Activity")} rows={await listAudit(c.env.DB, 200)} />));
adminRoutes.get("/admin/emails", async (c) => c.html(<EmailsPage meta={meta(c, "Emails")} rows={await listEmailLog(c.env.DB, 200)} />));
adminRoutes.get("/admin/backups", async (c) => c.html(<BackupsPage meta={meta(c, "Backups")} rows={await listBackups(c.env.DB, 50)} />));

adminRoutes.post("/admin/backups", async (c) => {
  await backupDatabase(c.env.DB, c.env.BACKUPS, "manual");
  await recordAudit(c.env.DB, { ...actorAudit(c), action: "backup.manual" });
  return back(c, "/admin/backups", "backup");
});

// --- Affiliates ---

async function renderAffiliates(c: Context<AppEnv>, error?: string) {
  return c.html(
    <AffiliatesAdminPage meta={meta(c, "Affiliates", { error: error ?? null })} settings={await affiliateSettings(c.env.DB)} affiliates={await listAffiliatesAdmin(c.env.DB)} />,
    error ? 422 : 200,
  );
}

adminRoutes.get("/admin/affiliates", (c) => renderAffiliates(c));

adminRoutes.post("/admin/affiliates/settings", async (c) => {
  const form = await c.req.parseBody();
  const error = await saveAffiliateSettings(c.env.DB, { rate: String(form.rate ?? ""), holdDays: String(form.hold_days ?? "90"), minPayout: String(form.min_payout ?? "10") }, actor(c));
  return error ? renderAffiliates(c, error) : back(c, "/admin/affiliates", "saved");
});

adminRoutes.post("/admin/affiliates/:id/payout", async (c) => {
  const form = await c.req.parseBody();
  if (form.confirm !== "yes") return c.redirect("/admin/affiliates", 303);
  const paid = await recordPayout(c.env.DB, idParam(c), { method: form.method === "bank" ? "bank" : "paypal", reference: String(form.reference ?? "") }, actor(c));
  return back(c, "/admin/affiliates", paid ? "payout" : "nopayout");
});

adminRoutes.post("/admin/affiliates/:id/terms", async (c) => {
  const form = await c.req.parseBody();
  const error = await setPartnerTerms(c.env.DB, idParam(c), { rate: String(form.rate ?? ""), note: String(form.note ?? "") }, actor(c));
  return error ? renderAffiliates(c, error) : back(c, "/admin/affiliates", "saved");
});

adminRoutes.post("/admin/affiliates/:id/status", async (c) => {
  await setAffiliateStatus(c.env.DB, idParam(c), (await c.req.parseBody()).status === "active" ? "active" : "suspended", actor(c));
  return back(c, "/admin/affiliates", "saved");
});

// --- Access codes (partners and beta testers) ---

const renderCodes = async (c: Context<AppEnv>, error: string | null = null) =>
  c.html(
    <CodesAdminPage
      meta={meta(c, "Access codes", { error })}
      codes={await listCodesWithResults(c.env.DB)}
      products={(await listProducts(c.env.DB)).map((p) => ({ slug: p.slug, title: p.title }))}
      siteUrl={c.env.SITE_URL}
    />,
    error ? 422 : 200,
  );

adminRoutes.get("/admin/codes", (c) => renderCodes(c));

adminRoutes.post("/admin/codes", async (c) => {
  const form = await c.req.parseBody({ all: true });
  const one = (k: string) => String(Array.isArray(form[k]) ? (form[k] as unknown[])[0] : (form[k] ?? "")).trim();
  const slugs = (Array.isArray(form.slugs) ? form.slugs : form.slugs ? [form.slugs] : []).map(String);
  const fee = one("monthly_fee").replace(/[£,\s]/g, "");
  const input: CodeInput = {
    code: one("code").toUpperCase(),
    kind: one("kind") === "beta" ? "beta" : "partner",
    label: one("label"),
    slugs,
    maxUses: one("max_uses") ? Number(one("max_uses")) : null,
    monthlyFeePence: fee && Number.isFinite(Number(fee)) ? Math.round(Number(fee) * 100) : null,
    affiliateCode: one("affiliate_code"),
    note: one("note"),
  };
  const known = (await listProducts(c.env.DB)).map((p) => p.slug);
  const error = codeProblem(input, known) ?? (await createAccessCode(c.env.DB, input, actor(c)));
  if (error) return renderCodes(c, error);
  return back(c, "/admin/codes", "created");
});

adminRoutes.post("/admin/codes/:id/status", async (c) => {
  const form = await c.req.parseBody();
  const status = form.status === "ended" ? (form.confirm === "yes" ? "ended" : null) : form.status === "paused" ? "paused" : "active";
  if (status) await setCodeStatus(c.env.DB, idParam(c), status, actor(c));
  return back(c, "/admin/codes", "saved");
});

// --- Reviews ---

adminRoutes.get("/admin/reviews", async (c) => c.html(<ReviewsAdminPage meta={meta(c, "Reviews")} reviews={await listReviewsAdmin(c.env.DB)} />));

adminRoutes.post("/admin/reviews/:id/status", async (c) => {
  const status = (await c.req.parseBody()).status === "approved" ? "approved" : "rejected";
  await moderateReview(c.env.DB, idParam(c), status, actor(c));
  return back(c, "/admin/reviews", "saved");
});

// --- Contact messages ---

adminRoutes.get("/admin/messages", async (c) => {
  const to = ((await loadSettings(c.env.DB)).get(CONTACT_EMAIL_KEY) ?? "").trim();
  return c.html(<MessagesAdminPage meta={meta(c, "Messages")} messages={await listContactMessages(c.env.DB)} forwardingTo={to || null} />);
});

adminRoutes.post("/admin/messages/:id/handled", async (c) => {
  await markContactHandled(c.env.DB, idParam(c), actor(c));
  return back(c, "/admin/messages", "saved");
});

// --- Email campaigns ---

adminRoutes.get("/admin/campaigns", async (c) =>
  c.html(<CampaignsPage meta={meta(c, "Email campaigns")} campaigns={await listCampaigns(c.env.DB)} audience={(await marketingAudience(c.env.DB)).length} />),
);

adminRoutes.post("/admin/campaigns", async (c) => {
  const id = await saveCampaign(c.env.DB, null, { subject: String((await c.req.parseBody()).subject ?? ""), body: "" }, actor(c));
  return id ? back(c, `/admin/campaigns/${id}`, "created") : c.redirect("/admin/campaigns", 303);
});

adminRoutes.get("/admin/campaigns/:id", async (c) => {
  const campaign = await getCampaign(c.env.DB, idParam(c));
  if (!campaign) return c.notFound();
  return c.html(<CampaignEditPage meta={meta(c, campaign.subject)} campaign={campaign} audience={(await marketingAudience(c.env.DB)).length} adminEmail={c.get("user")!.email} />);
});

adminRoutes.post("/admin/campaigns/:id", async (c) => {
  const form = await c.req.parseBody();
  const id = await saveCampaign(c.env.DB, idParam(c), { subject: String(form.subject ?? ""), body: String(form.body ?? "") }, actor(c));
  return id ? back(c, `/admin/campaigns/${id}`, "saved") : c.redirect(`/admin/campaigns/${idParam(c)}`, 303);
});

adminRoutes.post("/admin/campaigns/:id/test", async (c) => {
  const campaign = await getCampaign(c.env.DB, idParam(c));
  if (!campaign) return c.notFound();
  await sendCampaignTest(c.env, campaign, c.get("user")!.email);
  return back(c, `/admin/campaigns/${campaign.id}`, "tested");
});

adminRoutes.post("/admin/campaigns/:id/send", async (c) => {
  const id = idParam(c);
  if ((await c.req.parseBody()).confirm !== "yes") return c.redirect(`/admin/campaigns/${id}`, 303);
  await sendCampaign(c.env, id, actor(c));
  return back(c, `/admin/campaigns/${id}`, "sent");
});

// --- Launch checklist ---

adminRoutes.get("/admin/launch", async (c) => {
  // Render each public page as a logged-out visitor would see it, and list leftover placeholders.
  const { app } = await import("../index");
  const placeholders = await Promise.all(
    sitemapPaths().map(async (path) => ({ path, items: findPlaceholders(await (await app.request(path, {}, c.env)).text()) })),
  );
  return c.html(<LaunchPage meta={meta(c, "Launch checklist")} checks={await launchChecks(c.env)} placeholders={placeholders} />);
});
