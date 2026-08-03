import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import type { FoodSeller } from "@prisma/client";

/**
 * The seller-side Fresh Today domain: ownership resolution and the queries
 * `/food/stories` reads. Mirrors `lib/listing.ts`'s split from Slice 14 —
 * ownership always resolves from the SESSION, then scopes by
 * `{ id, sellerId }`, never by a bare story/highlight id.
 */

export async function requireOwnStory(storyId: string): Promise<{ seller: FoodSeller } | null> {
  const ctx = await requireOwnSeller();
  if (!ctx) return null;
  const story = await prisma.foodStory.findFirst({
    where: { id: storyId, sellerId: ctx.seller.id },
    select: { id: true },
  });
  if (!story) return null;
  return { seller: ctx.seller };
}

export async function requireOwnHighlight(highlightId: string): Promise<{ seller: FoodSeller } | null> {
  const ctx = await requireOwnSeller();
  if (!ctx) return null;
  const highlight = await prisma.foodStoryHighlight.findFirst({
    where: { id: highlightId, sellerId: ctx.seller.id },
    select: { id: true },
  });
  if (!highlight) return null;
  return { seller: ctx.seller };
}

/** `/food/stories`'s "Active now" list — this seller's non-expired posts, newest first. */
export async function activeStoriesForSeller(sellerId: string, now = new Date()) {
  return prisma.foodStory.findMany({
    where: { sellerId, expiresAt: { gt: now } },
    select: {
      id: true,
      pathThumb: true,
      pathCard: true,
      blurDataUrl: true,
      caption: true,
      createdAt: true,
      expiresAt: true,
      highlightId: true,
      linkedListing: { select: { title: true, slug: true } },
      _count: { select: { views: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * `/food/stories`'s Menu shelf manager — every highlight this seller owns,
 * with its stories regardless of `expiresAt` (a highlighted story is
 * displayed forever, so the manager has to be able to show/unassign one long
 * after it would otherwise have expired).
 */
export async function highlightsForSeller(sellerId: string) {
  return prisma.foodStoryHighlight.findMany({
    where: { sellerId },
    select: {
      id: true,
      title: true,
      sortOrder: true,
      stories: {
        select: { id: true, pathThumb: true, blurDataUrl: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * The basic seller dashboard (Slice 15's own narrowing of Part E7:
 * "views/saves/follows counts — not the full analytics/insights dashboard").
 *
 * - Views: `FoodDemandEvent` rows carrying this seller's id, across BOTH
 *   `PROFILE_VIEW` (their own profile page) and `LISTING_VIEW` (any of their
 *   dishes) — both kinds already write `sellerId` (Slice 9/10), so this is
 *   one count, not a join through every listing.
 * - Saves: `FoodSave` has no `sellerId` column (Part D — a save belongs to a
 *   listing), so this counts through the listing relation.
 * - Follows: `FoodSeller.followerCount`, the denormalized counter Slice 11
 *   already maintains transactionally on every follow/unfollow — read
 *   directly, not recomputed, matching how that slice established it as
 *   authoritative for display.
 */
export async function sellerDashboardStats(seller: Pick<FoodSeller, "id" | "followerCount">) {
  const [viewCount, saveCount] = await Promise.all([
    prisma.foodDemandEvent.count({
      where: { sellerId: seller.id, kind: { in: ["PROFILE_VIEW", "LISTING_VIEW"] } },
    }),
    prisma.foodSave.count({ where: { listing: { sellerId: seller.id } } }),
  ]);
  return { views: viewCount, saves: saveCount, follows: seller.followerCount };
}
