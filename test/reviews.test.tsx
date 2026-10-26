import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createEmailToken } from "../src/services/email-tokens";
import { sendReviewRequests } from "../src/services/automation";
import { moderateReview } from "../src/services/reviews";
import { productId, TestClient } from "./helpers";

const PW = "a long enough password";
let seq = 0;
async function member() {
  const email = `review${++seq}-${Date.now()}@example.com`;
  const order = await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json) VALUES (?1, ?2, 'paid', 100, '{}') RETURNING id").bind(`R-${crypto.randomUUID()}`, email).first<number>("id");
  await env.DB.prepare("INSERT INTO entitlements (email, product_id, order_id) VALUES (?1, ?2, ?3)").bind(email, await productId(env.DB, "hips"), order).run();
  const token = await createEmailToken(env.DB, "setup", email, order);
  const client = new TestClient(env);
  await client.post("/account/setup", { token, password: PW, confirm: PW });
  const userId = (await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first<number>("id"))!;
  return { client, email, userId };
}

describe("reviews", () => {
  it("members can leave a review, which only appears once approved and allowed", async () => {
    const { client, userId } = await member();
    expect((await client.get("/account/review")).status).toBe(200);
    expect((await client.post("/account/review", { rating: "5", body: "short", display_name: "Sam" })).status).toBe(422);
    const product = String(await productId(env.DB, "hips"));
    const res = await client.post("/account/review", { product, rating: "4", body: "Really helped me notice how much I grip my toes.", display_name: "Sam, Belfast", may_publish: "yes" });
    expect(res.status).toBe(303);
    const before = await (await new TestClient(env).get("/programmes/hips")).text();
    expect(before).not.toContain("Really helped me notice");
    const id = (await env.DB.prepare("SELECT id FROM reviews WHERE user_id = ?1").bind(userId).first<number>("id"))!;
    await moderateReview(env.DB, id, "approved", { userId: 1 });
    const after = await (await new TestClient(env).get("/programmes/hips")).text();
    expect(after).toContain("Really helped me notice how much I grip my toes.");
    expect(after).toContain("Sam, Belfast");
    expect(after).toContain("4 out of 5 stars");
  });

  it("never publishes a review the member kept private", async () => {
    const { client, userId } = await member();
    await client.post("/account/review", { rating: "2", body: "Private thoughts for the coach only.", display_name: "Jo" });
    const id = (await env.DB.prepare("SELECT id FROM reviews WHERE user_id = ?1").bind(userId).first<number>("id"))!;
    await moderateReview(env.DB, id, "approved", { userId: 1 });
    expect(await env.DB.prepare("SELECT status FROM reviews WHERE id = ?1").bind(id).first("status")).toBe("pending");
  });

  it("asks members for a review once, about three weeks after joining", async () => {
    const { userId, email } = await member();
    await env.DB.prepare("UPDATE users SET created_at = datetime('now', '-22 days') WHERE id = ?1").bind(userId).run();
    expect(await sendReviewRequests(env)).toBeGreaterThanOrEqual(1);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM email_log WHERE to_email = ?1 AND template = 'review_request'").bind(email).first("n")).toBe(1);
    await sendReviewRequests(env);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM email_log WHERE to_email = ?1 AND template = 'review_request'").bind(email).first("n")).toBe(1);
  });
});
