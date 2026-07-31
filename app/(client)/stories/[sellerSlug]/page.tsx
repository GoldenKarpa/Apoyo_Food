import { notFound } from "next/navigation";

import { FreshTodayViewer } from "@/components/fresh-today-viewer";
import { sellerActiveStories, sellerStoryQueue } from "@/lib/stories";
import { getFoodSession } from "@/lib/session";

/**
 * `/stories/[sellerSlug]` — the Fresh Today viewer's route (Slice 11,
 * architecture Part F1's sitemap: "Full-screen Fresh Today viewer"). The
 * route name stays generic per that same line; the UI is the Fresh Today
 * viewer, not a Stories product.
 *
 * 404s when the seller has no currently-active story — reachable by direct
 * URL (a stale link, a bookmarked share) after every post has expired, which
 * is a real state and not an error to hide differently from any other
 * not-found page.
 */
export default async function StoryViewerPage({
  params,
}: {
  params: Promise<{ sellerSlug: string }>;
}) {
  const { sellerSlug } = await params;
  const now = new Date();

  const [session, { seller, stories }] = await Promise.all([
    getFoodSession(),
    sellerActiveStories(sellerSlug, now),
  ]);
  if (!seller || stories.length === 0) notFound();

  const queue = await sellerStoryQueue(now, session?.userId ?? null);
  const position = queue.findIndex((entry) => entry.slug === sellerSlug);
  const nextSellerSlug = position >= 0 ? (queue[position + 1]?.slug ?? null) : null;
  const prevSellerSlug = position > 0 ? queue[position - 1].slug : null;

  return (
    <FreshTodayViewer
      seller={{ slug: seller.slug, displayName: seller.displayName }}
      stories={stories.map((story) => ({
        id: story.id,
        src: story.pathFull,
        blurDataUrl: story.blurDataUrl,
        caption: story.caption,
        linkedListing: story.linkedListing,
      }))}
      nextSellerSlug={nextSellerSlug}
      prevSellerSlug={prevSellerSlug}
    />
  );
}
