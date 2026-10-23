import { RichText } from "../../lib/markdown";
import type { LessonRow, ProductAdminRow } from "../../services/admin-content";
import type { CustomerRow, DashboardNumbers, OrderListRow } from "../../services/admin-ops";
import type { AuditRow } from "../../services/audit";
import type { BackupRow } from "../../services/backup";
import type { EmailLogRow } from "../../services/email";
import type { Product } from "../../services/products";
import { formatPrice } from "../../services/products";
import type { Revision } from "../../services/revisions";
import type { WordingField } from "../../services/site-content";
import type { StatsSummary } from "../../services/stats";
import { CsrfField } from "../layout";
import { AdminLayout, Confirm, StatusPill, type AdminMeta } from "./layout";

const money = (p: number | null | undefined) => (p == null ? "No price" : formatPrice(p));
const when = (iso: string | null | undefined) => (iso ? iso.replace("T", " ").slice(0, 16) : "—");

export function DashboardPage(props: { meta: AdminMeta; n: DashboardNumbers }) {
  const { n } = props;
  const todo: { text: string; href: string }[] = [];
  if (n.onSale === 0) todo.push({ text: "Nothing is on sale yet: set a price and put a programme on sale.", href: "/admin/programmes" });
  if (n.draftLessons > 0) todo.push({ text: `${n.draftLessons} lesson(s) still in draft.`, href: "/admin/programmes" });
  if (n.buyersWithoutAccount > 0) todo.push({ text: `${n.buyersWithoutAccount} buyer(s) haven't set up their account yet.`, href: "/admin/customers" });
  if (n.emailsFailed7 > 0) todo.push({ text: `${n.emailsFailed7} email(s) failed to send this week.`, href: "/admin/emails" });
  if (!n.lastBackup || n.lastBackup.status !== "ok") todo.push({ text: "The last backup didn't succeed. Check the backups page.", href: "/admin/backups" });
  return (
    <AdminLayout meta={props.meta}>
      <h1>Dashboard</h1>
      <div class="stat-grid">
        <div class="stat card">
          <span class="stat-label">Sales, last 7 days</span>
          <strong>{money(n.sales7.pence)}</strong>
          <span class="small muted">{n.sales7.count} order(s)</span>
        </div>
        <div class="stat card">
          <span class="stat-label">Sales, last 30 days</span>
          <strong>{money(n.sales30.pence)}</strong>
          <span class="small muted">{n.sales30.count} order(s)</span>
        </div>
        <div class="stat card">
          <span class="stat-label">Members with accounts</span>
          <strong>{n.members}</strong>
        </div>
        <div class="stat card">
          <span class="stat-label">Last backup</span>
          <strong>{n.lastBackup ? when(n.lastBackup.created_at) : "None yet"}</strong>
        </div>
      </div>
      <h2 class="h3">Needs attention</h2>
      {todo.length ? (
        <ul class="todo-list">
          {todo.map((t) => (
            <li>
              <a href={t.href}>{t.text}</a>
            </li>
          ))}
        </ul>
      ) : (
        <p class="notice notice-ok">All clear.</p>
      )}
    </AdminLayout>
  );
}

export function ProgrammesAdminPage(props: { meta: AdminMeta; products: ProductAdminRow[] }) {
  return (
    <AdminLayout meta={props.meta}>
      <h1>Programmes and bundles</h1>
      <p class="muted">A programme only appears in the shop when it's <strong>on sale</strong> and has a <strong>price</strong>.</p>
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Price</th>
              <th>Status</th>
              <th>Lessons</th>
              <th>Buyers</th>
            </tr>
          </thead>
          <tbody>
            {props.products.map((p) => (
              <tr>
                <td>
                  <a href={`/admin/programmes/${p.id}`}>{p.title}</a>
                </td>
                <td>{p.kind}</td>
                <td>{money(p.price_pence)}</td>
                <td>
                  <StatusPill status={p.status} />
                </td>
                <td>{p.kind === "programme" ? `${p.published} live / ${p.lessons}` : "—"}</td>
                <td>{p.buyers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form method="post" action="/admin/programmes" class="card inline-form">
        <CsrfField token={props.meta.csrfToken} />
        <h2 class="h3">Add new</h2>
        <div class="field">
          <label for="new-title">Title</label>
          <input id="new-title" name="title" type="text" maxlength={120} required />
        </div>
        <div class="field">
          <label for="new-kind">Type</label>
          <select id="new-kind" name="kind">
            <option value="programme">Programme (has its own lessons)</option>
            <option value="bundle">Bundle (a package of programmes)</option>
          </select>
        </div>
        <button class="btn btn-primary btn-small" type="submit">
          Create as draft
        </button>
      </form>
    </AdminLayout>
  );
}

export function ProductEditPage(props: {
  meta: AdminMeta;
  product: Product;
  lessons: LessonRow[];
  programmes: Product[];
  bundleItems: number[];
  history: Revision[];
}) {
  const p = props.product;
  const tabs: { key: "full" | "quick"; label: string }[] = [
    { key: "full", label: "Full Programme" },
    { key: "quick", label: "Quick Run-Through" },
  ];
  return (
    <AdminLayout meta={props.meta}>
      <p class="small">
        <a href="/admin/programmes">← All programmes</a>
      </p>
      <h1>{p.title}</h1>
      <form method="post" action={`/admin/programmes/${p.id}`} class="card">
        <CsrfField token={props.meta.csrfToken} />
        <div class="form-grid">
          <div class="field">
            <label for="title">Title</label>
            <input id="title" name="title" type="text" value={p.title} maxlength={120} required />
          </div>
          <div class="field">
            <label for="price">Price (£)</label>
            <input id="price" name="price" type="text" inputmode="decimal" value={p.price_pence != null ? (p.price_pence / 100).toFixed(2) : ""} placeholder="e.g. 49.00" />
            <p class="hint">Leave empty until you've decided.</p>
          </div>
          <div class="field">
            <label for="status">Status</label>
            <select id="status" name="status">
              {(["draft", "on_sale", "archived"] as const).map((s) => (
                <option value={s} selected={p.status === s}>
                  {s === "on_sale" ? "On sale" : s === "draft" ? "Draft (hidden from shop)" : "Archived"}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="sort">Order in lists</label>
            <input id="sort" name="sort_order" type="number" value={String(p.sort_order)} />
          </div>
        </div>
        <p class="hint">Changing the price only affects new orders. Past buyers keep what they paid for.</p>
        <button class="btn btn-primary btn-small" type="submit">
          Save
        </button>
      </form>

      {p.kind === "bundle" && (
        <form method="post" action={`/admin/programmes/${p.id}/bundle`} class="card">
          <CsrfField token={props.meta.csrfToken} />
          <h2 class="h3">What's in this bundle</h2>
          {props.programmes.map((x) => (
            <div class="check">
              <input type="checkbox" id={`b-${x.id}`} name="items" value={String(x.id)} checked={props.bundleItems.includes(x.id)} />
              <label for={`b-${x.id}`}>{x.title}</label>
            </div>
          ))}
          <button class="btn btn-primary btn-small" type="submit">
            Save bundle contents
          </button>
        </form>
      )}

      {p.kind === "programme" &&
        tabs.map((t) => {
          const rows = props.lessons.filter((l) => l.tab === t.key && l.status !== "archived");
          return (
            <section class="card">
              <div class="row-between">
                <h2 class="h3">{t.label}</h2>
                <a class="btn btn-ghost btn-small" href={`/admin/lessons/new?product=${p.id}&tab=${t.key}`}>
                  + Add section
                </a>
              </div>
              {rows.length === 0 ? (
                <p class="muted">No sections yet.</p>
              ) : (
                <ol class="lesson-admin-list">
                  {rows.map((l, i) => (
                    <li>
                      <div>
                        <a href={`/admin/lessons/${l.id}`}>{l.title}</a> <StatusPill status={l.status} />
                        {l.youtube_id && <span class="small muted"> · video</span>}
                        {l.image_key && <span class="small muted"> · image</span>}
                      </div>
                      <div class="row-actions">
                        {(["up", "down"] as const).map((dir) =>
                          (dir === "up" ? i > 0 : i < rows.length - 1) ? (
                            <form method="post" action={`/admin/lessons/${l.id}/move`}>
                              <CsrfField token={props.meta.csrfToken} />
                              <input type="hidden" name="direction" value={dir} />
                              <button class="link-button" type="submit" aria-label={`Move ${l.title} ${dir}`}>
                                {dir === "up" ? "↑" : "↓"}
                              </button>
                            </form>
                          ) : null,
                        )}
                        <form method="post" action={`/admin/lessons/${l.id}/duplicate`}>
                          <CsrfField token={props.meta.csrfToken} />
                          <button class="link-button" type="submit">
                            Duplicate
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}

      <div class="card">
        <h2 class="h3">More</h2>
        <form method="post" action={`/admin/programmes/${p.id}/duplicate`}>
          <CsrfField token={props.meta.csrfToken} />
          <button class="btn btn-ghost btn-small" type="submit">
            Duplicate as new draft
          </button>
        </form>
        <History meta={props.meta} history={props.history} restoreAction={(id) => `/admin/programmes/${p.id}/restore/${id}`} describe={(s) => `${s.title} · ${money(s.price_pence)} · ${s.status}`} />
      </div>
    </AdminLayout>
  );
}

function History(props: { meta: AdminMeta; history: Revision[]; restoreAction: (id: number) => string; describe: (snap: any) => string }) {
  if (!props.history.length) return <p class="small muted">No earlier versions yet.</p>;
  return (
    <details class="history">
      <summary>Earlier versions ({props.history.length})</summary>
      <ul>
        {props.history.map((r) => (
          <li>
            <span class="small">
              {when(r.created_at)}: {props.describe(JSON.parse(r.snapshot_json))}
            </span>
            <form method="post" action={props.restoreAction(r.id)}>
              <CsrfField token={props.meta.csrfToken} />
              <button class="link-button" type="submit">
                Restore this version
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function LessonEditPage(props: { meta: AdminMeta; product: Product; lesson: Partial<LessonRow> & { tab: "full" | "quick" }; history: Revision[]; videoInput?: string }) {
  const l = props.lesson;
  const isNew = !l.id;
  const action = isNew ? `/admin/lessons/new?product=${props.product.id}` : `/admin/lessons/${l.id}`;
  return (
    <AdminLayout meta={props.meta}>
      <p class="small">
        <a href={`/admin/programmes/${props.product.id}`}>← {props.product.title}</a>
      </p>
      <h1>{isNew ? "New section" : l.title}</h1>
      <div class="editor-grid">
        <form method="post" action={action} enctype="multipart/form-data" class="card">
          <CsrfField token={props.meta.csrfToken} />
          <div class="form-grid">
            <div class="field">
              <label for="tab">Tab</label>
              <select id="tab" name="tab">
                <option value="full" selected={l.tab === "full"}>
                  Full Programme
                </option>
                <option value="quick" selected={l.tab === "quick"}>
                  Quick Run-Through
                </option>
              </select>
            </div>
            <div class="field">
              <label for="status">Status</label>
              <select id="status" name="status">
                {(["draft", "published", "archived"] as const).map((s) => (
                  <option value={s} selected={(l.status ?? "draft") === s}>
                    {s === "published" ? "Published (members can see it)" : s === "draft" ? "Draft (hidden)" : "Archived"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div class="field">
            <label for="title">Title</label>
            <input id="title" name="title" type="text" value={l.title ?? ""} maxlength={200} required />
          </div>
          <div class="field">
            <label for="body">Text</label>
            <textarea id="body" name="body" rows={18}>
              {l.body ?? ""}
            </textarea>
            <p class="hint">
              Formatting: <code>## Heading</code>, <code>- bullet</code>, <code>1. numbered</code>, <code>&gt; Key point</code>, <code>**bold**</code>, <code>*italic*</code>, <code>[link](https://…)</code>. Blank line = new paragraph.
            </p>
          </div>
          <div class="field">
            <label for="video">YouTube link (optional)</label>
            <input id="video" name="video" type="url" value={props.videoInput ?? (l.youtube_id ? `https://youtu.be/${l.youtube_id}` : "")} placeholder="https://youtu.be/…" />
            <p class="hint">Set the video to "Unlisted" on YouTube so only members find it.</p>
          </div>
          <div class="field">
            <label for="image">Image (optional)</label>
            {l.image_key && (
              <p>
                <img class="admin-thumb" src={`/media/${l.image_key}`} alt="" />
                <label class="confirm-check">
                  <input type="checkbox" name="remove_image" value="yes" /> Remove this image
                </label>
              </p>
            )}
            <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
          </div>
          <div class="field">
            <label for="image_alt">Image description (for screen readers)</label>
            <input id="image_alt" name="image_alt" type="text" value={l.image_alt ?? ""} maxlength={200} />
          </div>
          <button class="btn btn-primary" type="submit">
            {isNew ? "Create section" : "Save changes"}
          </button>
        </form>
        {!isNew && (
          <aside class="card preview">
            <p class="eyebrow">Preview (as members see it)</p>
            <h2>{l.title}</h2>
            <div class="prose">
              <RichText source={l.body ?? ""} />
            </div>
            <History meta={props.meta} history={props.history} restoreAction={(id) => `/admin/lessons/${l.id}/restore/${id}`} describe={(s) => `${s.title} (${s.status}, ${String(s.body ?? "").length} characters)`} />
          </aside>
        )}
      </div>
    </AdminLayout>
  );
}

export function OrdersPage(props: { meta: AdminMeta; orders: OrderListRow[]; q: string; products: Product[] }) {
  return (
    <AdminLayout meta={props.meta}>
      <h1>Orders</h1>
      <form method="get" action="/admin/orders" class="search-form">
        <label for="q" class="sr-only">
          Search
        </label>
        <input id="q" name="q" type="search" value={props.q} placeholder="Search email or order ref" />
        <button class="btn btn-ghost btn-small" type="submit">
          Search
        </button>
      </form>
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Email</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.orders.map((o) => (
              <tr>
                <td>
                  <a href={`/admin/orders/${o.public_id}`}>{o.public_id}</a>
                </td>
                <td>{when(o.paid_at ?? o.created_at)}</td>
                <td>{o.email ?? "—"}</td>
                <td>{o.items}</td>
                <td>{money(o.total_pence)}</td>
                <td>
                  <StatusPill status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!props.orders.length && <p class="muted">No orders found.</p>}
      <form method="post" action="/admin/access" class="card inline-form">
        <CsrfField token={props.meta.csrfToken} />
        <h2 class="h3">Give someone a programme for free</h2>
        <p class="small muted">For gifts, testers or fixing a problem. Recorded as a £0 order and emailed to them.</p>
        <div class="field">
          <label for="g-email">Their email</label>
          <input id="g-email" name="email" type="email" required />
        </div>
        <div class="field">
          <label for="g-product">Programme or bundle</label>
          <select id="g-product" name="product">
            {props.products.map((p) => (
              <option value={String(p.id)}>{p.title}</option>
            ))}
          </select>
        </div>
        <button class="btn btn-primary btn-small" type="submit">
          Give access
        </button>
      </form>
    </AdminLayout>
  );
}

export function OrderDetailPage(props: {
  meta: AdminMeta;
  detail: { order: any; items: { title: string; price_pence: number }[]; access: { title: string; granted_at: string; revoked_at: string | null }[]; consents: Record<string, { given: boolean; version: string }> };
  canRefund: boolean;
}) {
  const { order, items, access, consents } = props.detail;
  return (
    <AdminLayout meta={props.meta}>
      <p class="small">
        <a href="/admin/orders">← Orders</a>
      </p>
      <h1>
        Order {order.public_id} <StatusPill status={order.status} />
      </h1>
      <div class="account-grid">
        <div class="card">
          <p>
            <strong>Email:</strong> {order.email ?? "—"}
            <br />
            <strong>Name:</strong> {order.name ?? "—"}
            <br />
            <strong>Country:</strong> {order.country ?? "—"}
            <br />
            <strong>Paid:</strong> {when(order.paid_at)}
            {order.refunded_at && (
              <>
                <br />
                <strong>Refunded:</strong> {when(order.refunded_at)}
              </>
            )}
            {order.ref_code && (
              <>
                <br />
                <strong>Referred by:</strong> {order.ref_code}
              </>
            )}
          </p>
          <ul>
            {items.map((i) => (
              <li>
                {i.title}: {money(i.price_pence)}
              </li>
            ))}
          </ul>
          <p>
            <strong>Total: {money(order.total_pence)}</strong>
          </p>
        </div>
        <div class="card">
          <h2 class="h3">Access</h2>
          <ul>
            {access.map((a) => (
              <li>
                {a.title}: {a.revoked_at ? `removed ${when(a.revoked_at)}` : `since ${when(a.granted_at)}`}
              </li>
            ))}
          </ul>
          <h2 class="h3">Tick boxes at checkout</h2>
          <ul class="small">
            {Object.entries(consents).map(([k, v]) => (
              <li>
                {k.replace(/_/g, " ")}: {v.given ? "yes" : "no"} (wording {v.version})
              </li>
            ))}
          </ul>
        </div>
      </div>
      {order.status === "paid" && (
        <div class="card danger-card">
          {props.canRefund && (
            <form method="post" action={`/admin/orders/${order.public_id}/refund`}>
              <CsrfField token={props.meta.csrfToken} />
              <h2 class="h3">Refund</h2>
              <p class="small">Refunds the full amount through Stripe. Access is removed automatically once Stripe confirms.</p>
              <Confirm label={`Yes, refund ${money(order.total_pence)} to ${order.email}`} />
              <button class="btn btn-danger btn-small" type="submit">
                Refund in full
              </button>
            </form>
          )}
          <form method="post" action={`/admin/orders/${order.public_id}/revoke`}>
            <CsrfField token={props.meta.csrfToken} />
            <h2 class="h3">Remove access without refunding</h2>
            <Confirm label="Yes, remove their access to this order's programmes" />
            <button class="btn btn-ghost btn-small" type="submit">
              Remove access
            </button>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}

export function CustomersPage(props: { meta: AdminMeta; customers: CustomerRow[]; q: string }) {
  return (
    <AdminLayout meta={props.meta}>
      <h1>Customers</h1>
      <form method="get" action="/admin/customers" class="search-form">
        <label for="q" class="sr-only">
          Search
        </label>
        <input id="q" name="q" type="search" value={props.q} placeholder="Search email" />
        <button class="btn btn-ghost btn-small" type="submit">
          Search
        </button>
        <a class="btn btn-ghost btn-small" href={`/admin/customers.csv${props.q ? `?q=${encodeURIComponent(props.q)}` : ""}`}>
          Download CSV
        </a>
      </form>
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Account</th>
              <th>Programmes</th>
              <th>Spent</th>
              <th>Since</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.customers.map((c) => (
              <tr>
                <td>
                  <a href={`/admin/orders?q=${encodeURIComponent(c.email)}`}>{c.email}</a>
                </td>
                <td>{c.name ?? "—"}</td>
                <td>{c.has_account ? "Yes" : "Not set up"}</td>
                <td>{c.programmes}</td>
                <td>{money(c.spent_pence)}</td>
                <td>{when(c.first_seen).slice(0, 10)}</td>
                <td>
                  {c.has_account ? (
                    <details>
                      <summary class="small">Delete</summary>
                      <form method="post" action="/admin/customers/delete">
                        <CsrfField token={props.meta.csrfToken} />
                        <input type="hidden" name="email" value={c.email} />
                        <Confirm label="Permanently delete this account (orders are kept for tax)" />
                        <button class="btn btn-danger btn-small" type="submit">
                          Delete account
                        </button>
                      </form>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!props.customers.length && <p class="muted">No customers yet.</p>}
    </AdminLayout>
  );
}

export function WordingPage(props: { meta: AdminMeta; fields: WordingField[]; values: Map<string, string> }) {
  return (
    <AdminLayout meta={props.meta}>
      <h1>Site wording</h1>
      <p class="muted">
        Edit the main wording on the public site. Text in <mark class="placeholder">[PLACEHOLDER: …]</mark> is still waiting for your words. Every save keeps the
        previous version.
      </p>
      <form method="post" action="/admin/wording" class="card">
        <CsrfField token={props.meta.csrfToken} />
        {props.fields.map((f) => (
          <div class="field">
            <label for={`w-${f.key}`}>{f.label}</label>
            {f.multiline ? (
              <textarea id={`w-${f.key}`} name={f.key} rows={f.key === "faqs" ? 24 : f.key === "coach.story" ? 10 : 3}>
                {props.values.get(f.key) ?? f.defaultValue}
              </textarea>
            ) : (
              <input id={`w-${f.key}`} name={f.key} type="text" value={props.values.get(f.key) ?? f.defaultValue} />
            )}
            <p class="hint">{f.help}</p>
          </div>
        ))}
        <button class="btn btn-primary" type="submit">
          Save wording
        </button>
      </form>
    </AdminLayout>
  );
}

export function StatsPage(props: { meta: AdminMeta; s: StatsSummary }) {
  const max = Math.max(1, ...props.s.days.map((d) => d.views));
  const f = props.s.funnel;
  return (
    <AdminLayout meta={props.meta}>
      <h1>Visitors (last 30 days)</h1>
      <p class="muted">Anonymous counts only: no cookies, no IP addresses. Your own admin visits aren't counted.</p>
      <div class="card">
        <div class="bars" role="img" aria-label="Page views per day for the last 30 days">
          {props.s.days.map((d) => (
            <span class={`bar h-${Math.round((d.views / max) * 20) * 5}`} title={`${d.day}: ${d.views}`} />
          ))}
        </div>
        <p class="small muted">
          {props.s.days[0]?.day} to {props.s.days[props.s.days.length - 1]?.day} · busiest day {max === 1 && !props.s.days.some((d) => d.views) ? 0 : max} views
        </p>
      </div>
      <div class="account-grid">
        <div class="card">
          <h2 class="h3">Shop steps</h2>
          <table class="admin-table">
            <tbody>
              <tr>
                <td>Page views</td>
                <td>{f.view}</td>
              </tr>
              <tr>
                <td>Added to basket</td>
                <td>{f.add_to_basket}</td>
              </tr>
              <tr>
                <td>Started checkout</td>
                <td>{f.checkout_started}</td>
              </tr>
              <tr>
                <td>Purchases</td>
                <td>{f.purchase}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h2 class="h3">Top pages</h2>
          <table class="admin-table">
            <tbody>
              {props.s.topPages.map((p) => (
                <tr>
                  <td>{p.path}</td>
                  <td>{p.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!props.s.topPages.length && <p class="muted">No visits yet.</p>}
        </div>
      </div>
    </AdminLayout>
  );
}

export function ActivityPage(props: { meta: AdminMeta; rows: AuditRow[] }) {
  return (
    <AdminLayout meta={props.meta}>
      <h1>Activity log</h1>
      <p class="muted">Every admin action, newest first. This log can't be edited.</p>
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>What</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr>
                <td>{when(r.created_at)}</td>
                <td>{r.action}</td>
                <td>{r.target_type ? `${r.target_type} ${r.target_id ?? ""}` : "—"}</td>
                <td class="small">{r.detail_json ? r.detail_json.slice(0, 160) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

export function BackupsPage(props: { meta: AdminMeta; rows: BackupRow[] }) {
  return (
    <AdminLayout meta={props.meta}>
      <h1>Backups</h1>
      <p class="muted">The database is backed up automatically every Sunday at 3am (UTC), and before every live update. Backups are stored in Cloudflare R2.</p>
      <form method="post" action="/admin/backups" class="inline-form">
        <CsrfField token={props.meta.csrfToken} />
        <button class="btn btn-primary btn-small" type="submit">
          Back up now
        </button>
      </form>
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr>
                <td>{when(r.created_at)}</td>
                <td>{r.kind}</td>
                <td>
                  <StatusPill status={r.status} /> {r.error && <span class="small">{r.error}</span>}
                </td>
                <td>{r.row_count ?? "—"}</td>
                <td>{r.size_bytes != null ? `${Math.ceil(r.size_bytes / 1024)} KB` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

export function EmailsPage(props: { meta: AdminMeta; rows: EmailLogRow[] }) {
  return (
    <AdminLayout meta={props.meta}>
      <h1>Emails sent</h1>
      <p class="muted">"Skipped" means email isn't switched on yet (no Resend key on this site).</p>
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>To</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr>
                <td>{when(r.created_at)}</td>
                <td>{r.to_email}</td>
                <td>{r.subject}</td>
                <td>
                  <StatusPill status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
