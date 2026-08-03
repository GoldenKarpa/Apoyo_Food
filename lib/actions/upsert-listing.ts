"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import { requireOwnListing } from "@/lib/listing";
import { uniqueListingSlug } from "@/lib/slug";
import {
  isListingKind,
  isPriceMode,
  MAX_DESCRIPTION_LENGTH,
  MAX_FEEDS_COUNT,
  MAX_INGREDIENT_TAG_LENGTH,
  MAX_INGREDIENT_TAGS,
  MAX_LISTING_CATEGORIES,
  MAX_OCCASION_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_TITLE_LENGTH,
  validatePriceForMode,
} from "@/lib/listing-form";
import { DIETARY_TAGS } from "@/lib/browse";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * Listing create + edit — ONE atomic Server Action for both, distinguished by
 * whether `id` is present in the form. Unlike Slice 13's onboarding wizard,
 * the brief describes this as a single form ("title/description, kind, price
 * mode + price, feeds-count, categories, dietary tags, ingredient tags,
 * occasion tag") rather than a resumable multi-step flow — there is no product
 * reason a dish needs to be built one field at a time, so it isn't.
 *
 * Photos and availability windows are deliberately NOT part of this action —
 * see `lib/actions/listing-photos.ts` and `lib/actions/listing-availability.ts`.
 * Both need an existing listing id to attach to (a photo/window belongs to a
 * row, not to a pending form), so `/food/listings/new` only ever shows the base
 * fields and redirects to the edit page — the same "create the parent first,
 * enrich after" shape Slice 13 used for a seller's own media.
 *
 * ⚠ `active` is NOT a field here — see `toggleListingActive` below. It is a
 * seller-facing pause switch the brief calls out on its own ("active toggle"),
 * and bundling it into a multi-field save would mean pausing a listing always
 * required touching everything else about it too.
 */

const baseSchema = z.object({
  title: z.string().trim().min(MIN_TITLE_LENGTH).max(MAX_TITLE_LENGTH),
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
  kind: z.string(),
  priceMode: z.string(),
  price: z.string(),
  feedsCount: z.string(),
  occasionTag: z.string().trim().max(MAX_OCCASION_TAG_LENGTH),
});

function readListInputs(formData: FormData) {
  const categoryIds = Array.from(new Set(formData.getAll("categoryIds").map(String).filter(Boolean)));
  const dietaryTags = Array.from(new Set(formData.getAll("dietaryTags").map(String).filter(Boolean)));
  const ingredientTags = Array.from(
    new Set(
      formData
        .getAll("ingredientTags")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  );
  return { categoryIds, dietaryTags, ingredientTags };
}

export async function upsertListing(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState & { listingId?: string }> {
  const parsed = baseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    kind: formData.get("kind"),
    priceMode: formData.get("priceMode"),
    price: formData.get("price"),
    feedsCount: formData.get("feedsCount"),
    occasionTag: formData.get("occasionTag") ?? "",
  });
  if (!parsed.success) return { status: "error", error: "title" };
  const { title, description, kind, priceMode, price, feedsCount, occasionTag } = parsed.data;

  if (!isListingKind(kind)) return { status: "error", error: "kind" };
  if (!isPriceMode(priceMode)) return { status: "error", error: "priceMode" };

  const priceCheck = validatePriceForMode(priceMode, price);
  if (!priceCheck.ok) return { status: "error", error: "price" };

  let feedsCountValue: number | null = null;
  const rawFeeds = feedsCount.trim();
  if (rawFeeds !== "") {
    const n = Number(rawFeeds);
    // Mirrors `food_listings_feeds_count_positive` (>= 1) — validated here so
    // a bad value is a form error, not the CHECK constraint's unhelpful 500.
    if (!Number.isInteger(n) || n < 1 || n > MAX_FEEDS_COUNT) {
      return { status: "error", error: "feedsCount" };
    }
    feedsCountValue = n;
  }

  const { categoryIds, dietaryTags, ingredientTags } = readListInputs(formData);
  if (categoryIds.length > MAX_LISTING_CATEGORIES) return { status: "error", error: "categories" };
  if (!dietaryTags.every((tag) => (DIETARY_TAGS as readonly string[]).includes(tag))) {
    return { status: "error", error: "categories" };
  }
  if (
    ingredientTags.length > MAX_INGREDIENT_TAGS ||
    ingredientTags.some((tag) => tag.length > MAX_INGREDIENT_TAG_LENGTH)
  ) {
    return { status: "error", error: "ingredientTags" };
  }

  const id = String(formData.get("id") ?? "").trim();

  const data = {
    title,
    description,
    kind,
    priceMode,
    priceCents: priceCheck.priceCents ?? null,
    feedsCount: feedsCountValue,
    dietaryTags,
    ingredientTags,
    occasionTag: occasionTag || null,
  };

  if (id) {
    const ctx = await requireOwnListing(id);
    if (!ctx) return { status: "error", error: "noListing" };
    const updated = await prisma.foodListing.update({
      where: { id },
      data: {
        ...data,
        // Replaced wholesale, same shape as `prisma/seed-demo.ts`'s own
        // category writes — the join table has no meaning per-row worth
        // preserving, so delete-then-recreate is simpler than a diff.
        categories: { deleteMany: {}, create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
      select: { slug: true },
    });
    revalidatePath("/food/listings");
    revalidatePath(`/food/listings/${id}`);
    revalidatePath(`/meals/${updated.slug}`);
    return { status: "ok", listingId: id };
  }

  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "signedOut" };

  let createdId: string | null = null;
  // Retries the check-then-write slug race, exactly as `onboardSeller` does —
  // two dishes named identically in the same instant can both be handed the
  // same free slug, and the loser sees P2002.
  for (let attempt = 0; attempt < 4 && !createdId; attempt += 1) {
    const slug = await uniqueListingSlug(title);
    try {
      const created = await prisma.foodListing.create({
        data: {
          sellerId: ctx.seller.id,
          slug,
          ...data,
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        },
        select: { id: true },
      });
      createdId = created.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  if (!createdId) return { status: "error", error: "unknown" };

  revalidatePath("/food/listings");
  revalidatePath("/food");
  return { status: "ok", listingId: createdId };
}

/**
 * The pause switch. ⚠ Deactivating is the ONLY "remove a listing" action this
 * product has — Slice 2's deletion policy is explicit that a hard delete of a
 * listing with orders is `Restrict`-blocked at the DB level, and the product
 * "never hard-deletes: `SellerStatus.SUSPENDED` and `FoodListing.active = false`
 * exist for that." There is deliberately no delete button anywhere in this UI.
 */
export async function toggleListingActive(listingId: string): Promise<SellerFormState> {
  const ctx = await requireOwnListing(listingId);
  if (!ctx) return { status: "error", error: "noListing" };
  const current = await prisma.foodListing.findUniqueOrThrow({
    where: { id: listingId },
    select: { active: true, slug: true, takenDownAt: true },
  });
  // An admin takedown (Slice 16) is a separate, higher-authority gate — the
  // seller's own pause switch must not be able to undo it.
  if (current.takenDownAt) return { status: "error", error: "takenDown" };
  await prisma.foodListing.update({ where: { id: listingId }, data: { active: !current.active } });
  revalidatePath("/food/listings");
  revalidatePath(`/food/listings/${listingId}`);
  revalidatePath(`/meals/${current.slug}`);
  return { status: "ok" };
}
