import { prisma } from "@/lib/prisma";
import { followedSellerIds } from "@/lib/follows";

/**
 * Queries for the Fresh Today viewer (`/stories/[sellerSlug]`, Slice 11,
 * architecture Part E2) — kept separate from `lib/discovery.ts`'s
 * `freshTodayEntries` (the home rail's per-STORY listing) because these are
 * per-SELLER: the viewer's "seller → seller continuation" needs an ordered
 * queue of sellers with active stories, not a flat list of story cards.
 */

export interface StorySellerQueueEntry {
  id: string;
  slug: string;
  displayName: string;
}

/**
 * Ordered sellers with at least one active (non-expired) story — followed
 * sellers first (unseen first within that group), then everyone else by how
 * recently they posted. Part E1 section 1's own wording: "followed sellers
 * first (unseen first), then recently-active sellers."
 *
 * This is also what `lib/discovery.ts`'s `freshTodayEntries` uses to re-order
 * its per-story cards, so the rail and the viewer's continuation order agree —
 * tapping a card and tapping through the viewer never contradict each other.
 */
export async function sellerStoryQueue(
  now = new Date(),
  userId: string | null = null,
): Promise<StorySellerQueueEntry[]> {
  const [activeStories, followed] = await Promise.all([
    prisma.foodStory.findMany({
      where: { expiresAt: { gt: now }, seller: { status: "ACTIVE" } },
      select: {
        id: true,
        createdAt: true,
        seller: { select: { id: true, slug: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    followedSellerIds(userId),
  ]);

  const seen = userId ? await seenStoryIds(userId, activeStories.map((s) => s.id)) : new Set<string>();

  const bySeller = new Map<
    string,
    { id: string; slug: string; displayName: string; mostRecent: Date; hasUnseen: boolean }
  >();
  for (const story of activeStories) {
    const existing = bySeller.get(story.seller.id);
    const isUnseen = !seen.has(story.id);
    if (existing) {
      if (story.createdAt > existing.mostRecent) existing.mostRecent = story.createdAt;
      if (isUnseen) existing.hasUnseen = true;
    } else {
      bySeller.set(story.seller.id, {
        id: story.seller.id,
        slug: story.seller.slug,
        displayName: story.seller.displayName,
        mostRecent: story.createdAt,
        hasUnseen: isUnseen,
      });
    }
  }

  return [...bySeller.values()]
    .sort((a, b) => {
      const aFollowed = followed.has(a.id) ? 1 : 0;
      const bFollowed = followed.has(b.id) ? 1 : 0;
      if (aFollowed !== bFollowed) return bFollowed - aFollowed;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.mostRecent.getTime() - a.mostRecent.getTime();
    })
    .map(({ id, slug, displayName }) => ({ id, slug, displayName }));
}

export interface ViewerStory {
  id: string;
  pathFull: string;
  blurDataUrl: string;
  caption: string | null;
  createdAt: Date;
  linkedListing: { slug: string; title: string } | null;
}

/** One seller's active stories, oldest first — the viewer's own slide order. */
export async function sellerActiveStories(sellerSlug: string, now = new Date()): Promise<{
  seller: { id: string; slug: string; displayName: string } | null;
  stories: ViewerStory[];
}> {
  const seller = await prisma.foodSeller.findFirst({
    where: { slug: sellerSlug, status: "ACTIVE" },
    select: { id: true, slug: true, displayName: true },
  });
  if (!seller) return { seller: null, stories: [] };

  const stories = await prisma.foodStory.findMany({
    where: { sellerId: seller.id, expiresAt: { gt: now } },
    select: {
      id: true,
      pathFull: true,
      blurDataUrl: true,
      caption: true,
      createdAt: true,
      linkedListing: { select: { slug: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return { seller, stories };
}

/** Batch lookup — which of these stories has this user already seen. */
export async function seenStoryIds(userId: string | null, storyIds: string[]): Promise<Set<string>> {
  if (!userId || storyIds.length === 0) return new Set();
  const rows = await prisma.foodStoryView.findMany({
    where: { userId, storyId: { in: storyIds } },
    select: { storyId: true },
  });
  return new Set(rows.map((r) => r.storyId));
}
