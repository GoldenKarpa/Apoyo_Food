"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireOwnListing } from "@/lib/listing";
import { deleteMedia } from "@/lib/storage";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * `FoodListingPhoto` removal and reordering — `lib/actions/seller-photos.ts`'s
 * shape, one relation hop further out. A listing photo is scoped through
 * `listing.sellerId`, not a direct `sellerId` column, so ownership is checked
 * via `requireOwnListing(listingId)` first and every write is additionally
 * filtered by `listingId` — a photo id alone still is never enough to act on,
 * even once the listing itself is confirmed to belong to this seller.
 *
 * Position 0 is the hero image (Part D, the schema's own comment on
 * `FoodListingPhoto.sortOrder`) — reordering to the top of the list is how a
 * seller changes which photo a `<MealCard>` shows.
 */

function revalidateListingSurfaces(listingId: string, slug: string): void {
  revalidatePath("/food/listings");
  revalidatePath(`/food/listings/${listingId}`);
  revalidatePath(`/meals/${slug}`);
}

export async function removeListingPhoto(listingId: string, photoId: string): Promise<SellerFormState> {
  const ctx = await requireOwnListing(listingId);
  if (!ctx) return { status: "error", error: "noListing" };

  const photo = await prisma.foodListingPhoto.findFirst({
    where: { id: photoId, listingId },
  });
  if (!photo) return { status: "error", error: "unknown" };

  const listing = await prisma.foodListing.findUniqueOrThrow({
    where: { id: listingId },
    select: { slug: true },
  });

  await prisma.foodListingPhoto.delete({ where: { id: photo.id } });
  // Row first, files second — an orphaned file is disk waste, but a row
  // pointing at deleted files is a broken image on a public listing.
  await Promise.all([photo.pathThumb, photo.pathCard, photo.pathFull].map((k) => deleteMedia(k)));

  revalidateListingSurfaces(listingId, listing.slug);
  return { status: "ok" };
}

/**
 * Moves one photo up or down, then RE-INDEXES the whole set 0..n-1 in one
 * transaction — the same reasoning `moveSellerPhoto` documents: `sort_order`
 * carries no unique index, so a swap of two equal values is a silent no-op
 * that looks like a working button. At most `MAX_LISTING_PHOTOS` rows, so the
 * cost of a full re-index is irrelevant.
 */
export async function moveListingPhoto(
  listingId: string,
  photoId: string,
  direction: "up" | "down",
): Promise<SellerFormState> {
  const ctx = await requireOwnListing(listingId);
  if (!ctx) return { status: "error", error: "noListing" };

  const photos = await prisma.foodListingPhoto.findMany({
    where: { listingId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  const index = photos.findIndex((p) => p.id === photoId);
  if (index === -1) return { status: "error", error: "unknown" };
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= photos.length) return { status: "ok" }; // already at the end

  const reordered = [...photos];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await prisma.$transaction(
    reordered.map((photo, position) =>
      prisma.foodListingPhoto.update({ where: { id: photo.id }, data: { sortOrder: position } }),
    ),
  );

  const listing = await prisma.foodListing.findUniqueOrThrow({
    where: { id: listingId },
    select: { slug: true },
  });
  revalidateListingSurfaces(listingId, listing.slug);
  return { status: "ok" };
}
