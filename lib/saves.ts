import { prisma } from "@/lib/prisma";

/**
 * Read side of Slice 10's save/favourite feature. Deliberately NOT a Server
 * Action — these are plain queries, called directly from a page's own Server
 * Component render to compute a heart's initial state. `lib/actions/save-listing.ts`
 * holds the mutation, which genuinely needs to be a Server Action (a Client
 * Component calls it on click).
 *
 * Mirrors Apparel's `lib/saves.ts` (its own Slice 10), the resolved precedent
 * for exactly this feature in this ecosystem — see that slice's notes for the
 * anonymous-buyer question this module deliberately does NOT re-litigate.
 */

/** Single lookup — the listing-detail page's own heart. */
export async function isListingSaved(userId: string | null, listingId: string): Promise<boolean> {
  if (!userId) return false;
  const existing = await prisma.foodSave.findUnique({
    where: { userId_listingId: { userId, listingId } },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Batch lookup for a grid/rail of cards — one query per page render rather
 * than one per card. Returns the subset of `listingIds` the viewer has saved.
 */
export async function savedListingIds(userId: string | null, listingIds: string[]): Promise<Set<string>> {
  if (!userId || listingIds.length === 0) return new Set();
  const rows = await prisma.foodSave.findMany({
    where: { userId, listingId: { in: listingIds } },
    select: { listingId: true },
  });
  return new Set(rows.map((r) => r.listingId));
}
