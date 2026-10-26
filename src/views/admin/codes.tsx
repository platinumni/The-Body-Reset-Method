import type { CodeReport } from "../../services/access-codes";
import { formatPrice } from "../../services/products";
import { CsrfField } from "../layout";
import { AdminLayout, type AdminMeta } from "./layout";

/** Access codes: partner codes (organisations pay, members unlock) and beta tester codes, with results per code. */
export function CodesAdminPage(props: { meta: AdminMeta; codes: CodeReport[]; products: { slug: string; title: string }[]; siteUrl: string }) {
  return (
    <AdminLayout meta={props.meta}>
      <h1>Access codes</h1>
      <p class="muted">
        Partner codes: a club, gym, employer or charity pays you monthly (invoice them from Stripe), and their members unlock access with the code. Beta codes:
        free access for testers in return for honest feedback. Their reviews are automatically labelled "given free access", as the law requires.
      </p>
      <form method="post" action="/admin/codes" class="card">
        <CsrfField token={props.meta.csrfToken} />
        <h2 class="h3">New code</h2>
        <div class="form-grid">
          <div class="field">
            <label for="ac-kind">Type</label>
            <select id="ac-kind" name="kind">
              <option value="partner">Partner (organisation pays)</option>
              <option value="beta">Beta tester (free)</option>
            </select>
          </div>
          <div class="field">
            <label for="ac-code">Code</label>
            <input id="ac-code" name="code" type="text" required maxlength={24} placeholder="e.g. ACME-GYM" />
          </div>
          <div class="field">
            <label for="ac-label">Organisation or group</label>
            <input id="ac-label" name="label" type="text" required maxlength={100} placeholder="e.g. Acme Gym, Belfast" />
          </div>
          <div class="field">
            <label for="ac-max">Maximum people (empty = no limit)</label>
            <input id="ac-max" name="max_uses" type="number" min="1" placeholder="e.g. 50" />
          </div>
          <div class="field">
            <label for="ac-fee">They pay per month (£, a note for you)</label>
            <input id="ac-fee" name="monthly_fee" type="text" inputmode="decimal" placeholder="e.g. 99" />
          </div>
          <div class="field">
            <label for="ac-aff">Partner share code for commission (optional)</label>
            <input id="ac-aff" name="affiliate_code" type="text" maxlength={12} />
            <p class="hint">If the organisation is also a commission partner, they earn on what these members buy later.</p>
          </div>
        </div>
        <fieldset class="field">
          <legend>Unlocks</legend>
          {props.products.map((p) => (
            <label class="check">
              <input type="checkbox" name="slugs" value={p.slug} /> {p.title}
            </label>
          ))}
        </fieldset>
        <div class="field">
          <label for="ac-note">Note (private)</label>
          <input id="ac-note" name="note" type="text" maxlength={500} />
        </div>
        <button class="btn btn-primary btn-small" type="submit">
          Create code
        </button>
      </form>
      {!props.codes.length && <p class="muted">No codes yet.</p>}
      {props.codes.length > 0 && (
        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>For</th>
                <th>Joined</th>
                <th>Active (30 days)</th>
                <th>Bought later</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {props.codes.map((r) => (
                <tr>
                  <td>
                    <code>{r.code}</code>
                    <br />
                    <span class="small muted">{r.kind === "beta" ? "Beta" : "Partner"}</span>
                  </td>
                  <td>
                    {r.label}
                    <br />
                    <span class="small muted">
                      {r.product_slugs.replace(/,/g, ", ")}
                      {r.monthly_fee_pence != null && ` · pays ${formatPrice(r.monthly_fee_pence)}/month`}
                      {r.affiliate_code && ` · commission: ${r.affiliate_code}`}
                    </span>
                    <br />
                    <span class="small muted">Share: {props.siteUrl}/redeem?code={r.code}</span>
                  </td>
                  <td>
                    {r.members}
                    {r.max_uses != null && ` of ${r.max_uses}`}
                    {r.requested > r.members && <span class="small muted"> ({r.requested - r.members} not confirmed)</span>}
                  </td>
                  <td>{r.active30}</td>
                  <td>
                    {r.laterSales}
                    {r.laterSales > 0 && ` · ${formatPrice(r.laterSalesPence)}`}
                  </td>
                  <td>{r.status}</td>
                  <td>
                    {r.status !== "ended" && (
                      <div class="row">
                        <form method="post" action={`/admin/codes/${r.id}/status`} class="inline-form">
                          <CsrfField token={props.meta.csrfToken} />
                          <input type="hidden" name="status" value={r.status === "active" ? "paused" : "active"} />
                          <button class="btn btn-ghost btn-small" type="submit">
                            {r.status === "active" ? "Pause" : "Resume"}
                          </button>
                        </form>
                        <form method="post" action={`/admin/codes/${r.id}/status`} class="inline-form">
                          <CsrfField token={props.meta.csrfToken} />
                          <input type="hidden" name="status" value="ended" />
                          <label class="check small">
                            <input type="checkbox" name="confirm" value="yes" required /> Also remove members' access
                          </label>
                          <button class="btn btn-ghost btn-small" type="submit">
                            End
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p class="small muted">Pause stops new people joining; existing members keep access. End removes the access the code gave, for example if the organisation stops paying.</p>
    </AdminLayout>
  );
}
