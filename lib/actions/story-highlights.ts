"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import { requireOwnHighlight, requireOwnStory } from "@/lib/seller-stories";
import { MAX_HIGHLIGHT_TITLE_LENGTH, MAX_HIGHLIGHTS_PER_SELLER } from "@/lib/story-form";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * The Menu shelf manager's mutations — create/name/assign, the brief's own
 * three verbs. No `coverImage` field is settable here: `FoodStoryHighlight
 * .coverImage` is a manual override the schema already supports, but the
 * profile page already falls back to the highlight's most recently linked
 * story's own photo when it's unset (Slice 11), which is the right cover for
 * "whatever's currently on this shelf" without adding a second photo-upload
 * flow this brief never asks for.
 */

function revalidateShelfSurfaces(sellerSlug: string): void {
  revalidatePath("/food/stories");
  revalidatePath(`/sellers/${sellerSlug}`);
  revalidatePath(`/stories/${sellerSlug}`);
}

export async function createHighlight(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "signedOut" };

  const parsed = z
    .string()
    .trim()
    .min(1)
    .max(MAX_HIGHLIGHT_TITLE_LENGTH)
    .safeParse(formData.get("title"));
  if (!parsed.success) return { status: "error", error: "highlightTitle" };

  const count = await prisma.foodStoryHighlight.count({ where: { sellerId: ctx.seller.id } });
  if (count >= MAX_HIGHLIGHTS_PER_SELLER) return { status: "error", error: "highlightLimit" };

  await prisma.foodStoryHighlight.create({
    data: { sellerId: ctx.seller.id, title: parsed.data, sortOrder: count },
  });

  revalidateShelfSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

export async function renameHighlight(
  highlightId: string,
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnHighlight(highlightId);
  if (!ctx) return { status: "error", error: "noHighlight" };

  const parsed = z
    .string()
    .trim()
    .min(1)
    .max(MAX_HIGHLIGHT_TITLE_LENGTH)
    .safeParse(formData.get("title"));
  if (!parsed.success) return { status: "error", error: "highlightTitle" };

  await prisma.foodStoryHighlight.update({ where: { id: highlightId }, data: { title: parsed.data } });
  revalidateShelfSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

/**
 * ⚠ Deleting a highlight does NOT delete its stories. `FoodStory.highlight`
 * is `onDelete: SetNull` (Slice 2) — a removed shelf releases its stories
 * back to plain (now very possibly expired) posts, which `food-sweep` picks
 * up on its next pass exactly as if they had never been highlighted. No
 * application-level cleanup needed; the FK does the whole job.
 */
export async function deleteHighlight(highlightId: string): Promise<SellerFormState> {
  const ctx = await requireOwnHighlight(highlightId);
  if (!ctx) return { status: "error", error: "noHighlight" };

  await prisma.foodStoryHighlight.delete({ where: { id: highlightId } });
  revalidateShelfSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

/**
 * Assign or unassign one story. `highlightId: null` un-assigns — the story
 * reverts to a plain post, eligible for `food-sweep` again the moment
 * `expiresAt` (frozen at whatever it always was) is in the past, which for an
 * old highlighted post being taken down off the shelf is very possibly
 * already true.
 *
 * ⚠ TWO ownership checks, not one: the story must be this seller's, and if a
 * highlight is named, it must ALSO be this seller's — a seller cannot file
 * their own story under a rival's shelf, or unknowingly hand a stranger's
 * story a home on their own.
 */
export async function assignStoryToHighlight(
  storyId: string,
  highlightId: string | null,
): Promise<SellerFormState> {
  const storyCtx = await requireOwnStory(storyId);
  if (!storyCtx) return { status: "error", error: "noStory" };

  if (highlightId) {
    const highlightCtx = await requireOwnHighlight(highlightId);
    if (!highlightCtx) return { status: "error", error: "noHighlight" };
  }

  await prisma.foodStory.update({ where: { id: storyId }, data: { highlightId } });
  revalidateShelfSurfaces(storyCtx.seller.slug);
  return { status: "ok" };
}
