import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import { Prisma, type FoodSeller } from "@prisma/client";

/**
 * The seller-side listing domain: ownership resolution and the queries
 * `/food/listings` and its create/edit pages read.
 *
 * ⚠ Same rule as `lib/seller.ts`'s `requireOwnSeller`: ownership comes from
 * the SESSION, never from an id in the request. `requireOwnListing` resolves
 * the seller first and then scopes the listing lookup by `{ id, sellerId }` —
 * never by listing id alone, so "edit someone else's dish" is not a request
 * shape that exists. A `PENDING` seller may create and edit listings (the
 * done-when names this explicitly); nothing here checks `seller.status`.
 */

// `satisfies`, not `as const` — an `as const` on the whole object freezes the
// nested `orderBy` arrays into readonly tuples, which Prisma's generated
// `FoodListingSelect` type rejects (it wants mutable arrays). `satisfies`
// checks the shape against Prisma's own type without changing the arrays'
// mutability, which is what let `select` actually take effect below — without
// it, a rejected `select` silently falls back to Prisma's DEFAULT (full
// scalar, no relations) shape, and every read of `.photos`/`.categories`/
// `.availabilityWindows` on the result fails to typecheck.
export const LISTING_EDIT_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  kind: true,
  priceMode: true,
  priceCents: true,
  feedsCount: true,
  dietaryTags: true,
  ingredientTags: true,
  occasionTag: true,
  active: true,
  createdAt: true,
  photos: {
    select: { id: true, pathThumb: true, pathCard: true, pathFull: true, blurDataUrl: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  },
  categories: {
    select: { categoryId: true },
  },
  availabilityWindows: {
    select: {
      id: true,
      type: true,
      daysOfWeek: true,
      startsOn: true,
      endsOn: true,
      leadTimeDays: true,
      note: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.FoodListingSelect;

export type ListingForEdit = NonNullable<Awaited<ReturnType<typeof listingForEdit>>>;

export async function requireOwnListing(
  listingId: string,
): Promise<{ seller: FoodSeller } | null> {
  const ctx = await requireOwnSeller();
  if (!ctx) return null;
  const listing = await prisma.foodListing.findFirst({
    where: { id: listingId, sellerId: ctx.seller.id },
    select: { id: true },
  });
  if (!listing) return null;
  return { seller: ctx.seller };
}

/** Full detail for the edit page — ownership-scoped, `null` if not yours or not found. */
export async function listingForEdit(listingId: string, sellerId: string) {
  return prisma.foodListing.findFirst({
    where: { id: listingId, sellerId },
    select: LISTING_EDIT_SELECT,
  });
}

/** The `/food/listings` list — every listing this seller owns, most recently touched first. */
export async function sellerListingSummaries(sellerId: string) {
  return prisma.foodListing.findMany({
    where: { sellerId },
    select: {
      id: true,
      slug: true,
      title: true,
      priceMode: true,
      priceCents: true,
      active: true,
      updatedAt: true,
      photos: {
        select: { pathThumb: true, blurDataUrl: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      _count: { select: { availabilityWindows: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function sellerCategoryOptions() {
  return prisma.foodCategory.findMany({
    select: { id: true, slug: true, nameEn: true, nameEs: true, seasonal: true },
    orderBy: { sortOrder: "asc" },
  });
}
