"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import { requireOwnStory } from "@/lib/seller-stories";
import { deleteMedia, safeStorageKey } from "@/lib/storage";
import { expiresAtFrom, MAX_CAPTION_LENGTH } from "@/lib/story-form";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * Post a Fresh Today entry (architecture Part E2: "photo -> optional caption
 * -> optional linked listing -> post", "≤3 taps").
 *
 * ⚠ The photo is uploaded BEFORE this action runs, through `/api/media/upload`
 * with `kind: "story"` — Slice 4's original generic route, reserved from its
 * own Slice 4 comment for exactly this case: an entity whose photo needs to
 * exist before the entity itself does. `isStoryStorageKey` below is the
 * trust-boundary check this action applies to whatever keys the client hands
 * back — a tampered request naming a key from a different category
 * (`sellers/...`, `listings/...`) is rejected outright, not written into a
 * public-facing `FoodStory` row. It lives HERE, not in `lib/story-form.ts`
 * (which `<StoryPostForm>`, a Client Component, also imports for its pure
 * constants) — that module must never import anything that touches `fs`, or
 * webpack bundles it into the browser and the production build fails outright
 * (`Module not found: Can't resolve 'fs/promises'`, caught the hard way once
 * already, invisible to `tsc`/lint since both are blind to bundle
 * boundaries).
 *
 * ⚠ No `updateStory` exists ANYWHERE in this codebase, on purpose. Part E2:
 * "No scheduling, no editing after post (delete + repost) — keep the surface
 * tiny." Only `deleteStory` (below) and this creation action exist.
 */

function isStoryStorageKey(key: string): boolean {
  const safe = safeStorageKey(key);
  return !!safe && safe.split(/[\\/]/)[0] === "stories";
}

const schema = z.object({
  pathThumb: z.string(),
  pathCard: z.string(),
  pathFull: z.string(),
  blurDataUrl: z.string().min(1),
  caption: z.string().trim().max(MAX_CAPTION_LENGTH),
  linkedListingId: z.string(),
});

export async function createStory(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState & { storyId?: string }> {
  const parsed = schema.safeParse({
    pathThumb: formData.get("pathThumb"),
    pathCard: formData.get("pathCard"),
    pathFull: formData.get("pathFull"),
    blurDataUrl: formData.get("blurDataUrl"),
    caption: formData.get("caption") ?? "",
    linkedListingId: formData.get("linkedListingId") ?? "",
  });
  if (!parsed.success) return { status: "error", error: "photo" };
  const { pathThumb, pathCard, pathFull, blurDataUrl, caption, linkedListingId } = parsed.data;

  if (![pathThumb, pathCard, pathFull].every(isStoryStorageKey)) {
    return { status: "error", error: "photo" };
  }

  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "signedOut" };

  if (linkedListingId) {
    // Scoped by seller AND active — linking a paused or someone else's
    // listing would be either a dead end (the meal page 404s a paused
    // listing regardless of seller status, Slice 14) or another seller's
    // dish entirely. Both are rejected the same way, at the same check.
    const listing = await prisma.foodListing.findFirst({
      where: { id: linkedListingId, sellerId: ctx.seller.id, active: true },
      select: { id: true },
    });
    if (!listing) return { status: "error", error: "linkedListing" };
  }

  const createdAt = new Date();
  const created = await prisma.foodStory.create({
    data: {
      sellerId: ctx.seller.id,
      pathThumb,
      pathCard,
      pathFull,
      blurDataUrl,
      caption: caption || null,
      linkedListingId: linkedListingId || null,
      createdAt,
      expiresAt: expiresAtFrom(createdAt),
    },
  });

  // Part E2: "posting bumps the seller's recent-activity signal" — a plain
  // column, deliberately NOT a FoodDemandEvent (Slice 8's own schema comment:
  // presence, not demand).
  await prisma.foodSeller.update({ where: { id: ctx.seller.id }, data: { lastStoryAt: createdAt } });

  revalidatePath("/food/stories");
  revalidatePath("/food");
  revalidatePath(`/sellers/${ctx.seller.slug}`);
  revalidatePath(`/stories/${ctx.seller.slug}`);

  return { status: "ok", storyId: created.id };
}

/**
 * Delete + repost is the entire edit story (Part E2). Ownership-scoped by
 * `requireOwnStory` (`{ id, sellerId }`, never a bare story id — the same
 * compound-where rule every seller-owned mutation in this app follows).
 *
 * Row deleted before files — the normal order elsewhere in this app — because
 * a seller-initiated delete is a genuine removal with no replacement in
 * flight, unlike `food-sweep`'s expiry pass (`lib/sweep.ts`), which
 * deliberately inverts the order for a different, documented reason.
 */
export async function deleteStory(storyId: string): Promise<SellerFormState> {
  const ctx = await requireOwnStory(storyId);
  if (!ctx) return { status: "error", error: "noStory" };

  const story = await prisma.foodStory.findUniqueOrThrow({
    where: { id: storyId },
    select: { pathThumb: true, pathCard: true, pathFull: true },
  });

  await prisma.foodStory.delete({ where: { id: storyId } });
  await Promise.all([deleteMedia(story.pathThumb), deleteMedia(story.pathCard), deleteMedia(story.pathFull)]);

  revalidatePath("/food/stories");
  revalidatePath("/food");
  revalidatePath(`/sellers/${ctx.seller.slug}`);
  revalidatePath(`/stories/${ctx.seller.slug}`);

  return { status: "ok" };
}
