// Member reviews: collected from members, checked by the owner, then shown on the site.
// UK law: reviews must be genuine, and genuine negative ones can't be hidden. Reject only
// abuse, personal information or posts that aren't about the programme.

import { recordAudit } from "./audit";
import type { Actor } from "./admin-content";
import type { Testimonial } from "./site-content";

export type Review = { id: number; user_id: number; email: string; product_title: string | null; rating: number; body: string; display_name: string; may_publish: number; status: string; created_at: string };

export type ReviewInput = { productId: number | null; rating: number; body: string; displayName: string; mayPublish: boolean };

export function reviewProblem(i: ReviewInput): string | null {
  if (!Number.isInteger(i.rating) || i.rating < 1 || i.rating > 5) return "Please choose a star rating.";
  if (i.body.length < 10) return "Please write a sentence or two.";
  if (i.body.length > 2000) return "Please keep it under 2,000 characters.";
  if (!i.displayName || i.displayName.length > 60) return "Please add a name to show, e.g. your first name and town.";
  return null;
}

/** The programmes this member owns, to choose what the review is about. */
export async function reviewableProducts(db: D1Database, userId: number): Promise<{ id: number; title: string }[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT p.id, p.title FROM entitlements e JOIN products p ON p.id = e.product_id WHERE e.user_id = ?1 AND e.revoked_at IS NULL ORDER BY p.sort_order")
    .bind(userId)
    .all<{ id: number; title: string }>();
  return results;
}

export async function submitReview(db: D1Database, userId: number, i: ReviewInput): Promise<void> {
  const owned = i.productId == null || (await reviewableProducts(db, userId)).some((p) => p.id === i.productId);
  await db
    .prepare("INSERT INTO reviews (user_id, product_id, rating, body, display_name, may_publish) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(userId, owned ? i.productId : null, i.rating, i.body, i.displayName, i.mayPublish ? 1 : 0)
    .run();
}

export async function listReviewsAdmin(db: D1Database): Promise<Review[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.user_id, u.email, p.title AS product_title, r.rating, r.body, r.display_name, r.may_publish, r.status, r.created_at
       FROM reviews r JOIN users u ON u.id = r.user_id LEFT JOIN products p ON p.id = r.product_id
       ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC LIMIT 300`,
    )
    .all<Review>();
  return results;
}

export async function moderateReview(db: D1Database, id: number, status: "approved" | "rejected", actor: Actor): Promise<void> {
  await db.prepare("UPDATE reviews SET status = ?1, moderated_at = datetime('now') WHERE id = ?2 AND (may_publish = 1 OR ?1 = 'rejected')").bind(status, id).run();
  await recordAudit(db, { actorUserId: actor.userId, action: `review.${status}`, targetType: "review", targetId: id, ip: actor.ip });
}

/** Approved reviews the member agreed to publish, optionally for one programme. */
export async function publishedReviews(db: D1Database, productSlug?: string): Promise<Testimonial[]> {
  const { results } = await db
    .prepare(
      `SELECT r.body, r.display_name, r.rating FROM reviews r LEFT JOIN products p ON p.id = r.product_id
       WHERE r.status = 'approved' AND r.may_publish = 1 AND (?1 IS NULL OR p.slug = ?1)
       ORDER BY r.id DESC LIMIT 12`,
    )
    .bind(productSlug ?? null)
    .all<{ body: string; display_name: string; rating: number }>();
  return results.map((r) => ({ quote: r.body, who: r.display_name, rating: r.rating }));
}
