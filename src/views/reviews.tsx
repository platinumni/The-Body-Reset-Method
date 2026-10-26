import { CsrfField, Layout, type PageMeta } from "./layout";

export function ReviewPage(props: {
  meta: PageMeta;
  csrfToken: string;
  products: { id: number; title: string }[];
  sent?: boolean;
  error?: string | null;
  values?: { productId: string; rating: string; body: string; displayName: string; mayPublish: boolean };
}) {
  const v = props.values ?? { productId: "", rating: "", body: "", displayName: "", mayPublish: true };
  return (
    <Layout meta={props.meta}>
      <section class="page-hero">
        <div class="wrap narrow">
          <p class="small">
            <a href="/account">← My programmes</a>
          </p>
          <p class="eyebrow">Your review</p>
          <h1>How's it going?</h1>
          <p class="lede">An honest sentence or two helps other people decide, and helps us improve. Good or bad, we'd like to hear it.</p>
        </div>
      </section>
      <section class="band band-tight">
        <div class="wrap narrow">
          {props.sent ? (
            <p class="notice notice-ok" role="status">
              Thank you. We read every review, and we'll publish it once we've checked it (if you said we could).
            </p>
          ) : (
            <form method="post" action="/account/review" class="card">
              <CsrfField token={props.csrfToken} />
              {props.error && (
                <p class="notice notice-error" role="alert">
                  {props.error}
                </p>
              )}
              {props.products.length > 1 && (
                <div class="field">
                  <label for="rv-product">Which programme?</label>
                  <select id="rv-product" name="product">
                    {props.products.map((p) => (
                      <option value={String(p.id)} selected={v.productId === String(p.id)}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {props.products.length === 1 && <input type="hidden" name="product" value={String(props.products[0]!.id)} />}
              <fieldset class="field">
                <legend>Your rating</legend>
                <div class="star-choices">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <label class="diet-pill">
                      <input type="radio" name="rating" value={String(n)} checked={v.rating === String(n)} required />
                      <span>
                        {n} star{n === 1 ? "" : "s"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div class="field">
                <label for="rv-body">Your review</label>
                <textarea id="rv-body" name="body" rows={5} maxlength={2000} required>
                  {v.body}
                </textarea>
                <p class="hint">Please share your own experience. No medical details needed.</p>
              </div>
              <div class="field">
                <label for="rv-name">Name to show</label>
                <input id="rv-name" name="display_name" type="text" maxlength={60} placeholder="e.g. Sam, Belfast" value={v.displayName} required />
              </div>
              <label class="check">
                <input type="checkbox" name="may_publish" value="yes" checked={v.mayPublish} /> You can publish this review on the website with the name above.
              </label>
              <button class="btn btn-primary" type="submit">
                Send my review
              </button>
            </form>
          )}
        </div>
      </section>
    </Layout>
  );
}
