import { prisma } from "@/lib/prisma";

/**
 * Read side of Slice 11's follow feature — the exact shape of Slice 10's
 * `lib/saves.ts`: plain queries, called directly from a page's own Server
 * Component render, never a Server Action round-trip for something that's
 * just a read. `lib/actions/follow-seller.ts` holds the mutation.
 */

/** The seller profile's own Follow button — single lookup. */
export async function isSellerFollowed(userId: string | null, sellerId: string): Promise<boolean> {
  if (!userId) return false;
  const existing = await prisma.foodFollow.findUnique({
    where: { userId_sellerId: { userId, sellerId } },
    select: { id: true },
  });
  return !!existing;
}

/** Batch lookup — the followed-first ordering the Fresh Today rail needs. */
export async function followedSellerIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await prisma.foodFollow.findMany({
    where: { userId },
    select: { sellerId: true },
  });
  return new Set(rows.map((r) => r.sellerId));
}
