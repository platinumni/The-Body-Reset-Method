import { app } from "../src/index";

/** A tiny browser: keeps cookies between requests and pulls the CSRF token out of pages. */
export class TestClient {
  cookies = new Map<string, string>();
  csrf = "";
  /** Each client gets its own IP so rate limits from other tests don't interfere. */
  ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  constructor(public env: Env) {}

  private store(res: Response) {
    for (const h of res.headers.getSetCookie()) {
      const [pair, ...attrs] = h.split(";");
      const [name, ...rest] = pair!.split("=");
      const value = rest.join("=");
      const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=Thu, 01 Jan 1970/i.test(a));
      if (expired || value === "") this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value);
    }
  }

  private headers(extra: Record<string, string> = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { "CF-Connecting-IP": this.ip, ...(cookie ? { Cookie: cookie } : {}), ...extra };
  }

  async get(path: string) {
    const res = await app.request(path, { headers: this.headers() }, this.env);
    this.store(res);
    const html = await res.clone().text();
    const m = /name="_csrf" value="([^"]+)"/.exec(html);
    if (m) this.csrf = m[1]!;
    return res;
  }

  async post(path: string, fields: Record<string, string> = {}) {
    if (!this.csrf) await this.get("/");
    if (!this.csrf) this.csrf = [...this.cookies].find(([k]) => k.includes("csrf"))?.[1] ?? "";
    const body = new URLSearchParams({ _csrf: this.csrf, ...fields });
    const res = await app.request(path, { method: "POST", body, headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }) }, this.env);
    this.store(res);
    return res;
  }
}

export async function putOnSale(db: D1Database, slug: string, pence: number) {
  await db.prepare("UPDATE products SET price_pence = ?1, status = 'on_sale' WHERE slug = ?2").bind(pence, slug).run();
}

export async function productId(db: D1Database, slug: string): Promise<number> {
  return (await db.prepare("SELECT id FROM products WHERE slug = ?1").bind(slug).first<number>("id"))!;
}
