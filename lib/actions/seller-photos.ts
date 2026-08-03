"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import { deleteMedia } from "@/lib/storage";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * Gallery manager mutations for `FoodSellerPhoto` (removal and ordering).
 * Uploads are the route handler's job (`app/api/seller/media`) because they
 * carry a file body; everything else is a Server Action, matching the shape
 * Slices 10 and 11 already established for `FoodSave`/`FoodFollow`.
 *
 * ⚠ Both actions resolve the seller from the SESSION and then scope the write
 * by `{ id, sellerId }` — never by photo id alone. A photo id is a cuid a
 * seller can read out of their own page source, so scoping only by id would
 * make "remove a rival's gallery photo" a one-line request. The compound
 * `where` makes it a no-op instead of a check that could be forgotten.
 */

function revalidateSellerSurfaces(slug: string): void {
  revalidatePath("/food");
  revalidatePath("/food/profile");
  revalidatePath("/food/profile/setup");
  revalidatePath(`/sellers/${slug}`);
}

export async function removeSellerPhoto(photoId: string): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "noSeller" };

  const photo = await prisma.foodSellerPhoto.findFirst({
    where: { id: photoId, sellerId: ctx.seller.id },
  });
  if (!photo) return { status: "error", error: "unknown" };

  await prisma.foodSellerPhoto.delete({ where: { id: photo.id } });
  // Row first, files second: an orphaned file is disk waste, but a row pointing
  // at deleted files is a broken image on a public profile.
  await Promise.all([photo.pathThumb, photo.pathCard, photo.pathFull].map((k) => deleteMedia(k)));

  revalidateSellerSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

/**
 * Moves one photo up or down, then RE-INDEXES the whole gallery 0..n-1 in one
 * transaction.
 *
 * ⚠ Re-index rather than swap two `sortOrder` values, and the reason is in the
 * data: `sort_order` carries no unique index, and the Slice 8 seed writes rows
 * that can share a value. Swapping two equal numbers is a no-op that renders as
 * a button which does nothing — the worst kind of bug, because the page looks
 * like it worked. Assigning positions from the resolved list order makes the
 * stored column agree with what the seller sees, every time, whatever it held
 * before. At most 12 rows, so the cost is irrelevant.
 */
export async function moveSellerPhoto(
  photoId: string,
  direction: "up" | "down",
): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "noSeller" };

  const photos = await prisma.foodSellerPhoto.findMany({
    where: { sellerId: ctx.seller.id },
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
      prisma.foodSellerPhoto.update({ where: { id: photo.id }, data: { sortOrder: position } }),
    ),
  );

  revalidateSellerSurfaces(ctx.seller.slug);
  return { status: "ok" };
}
