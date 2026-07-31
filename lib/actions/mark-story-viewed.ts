"use server";

import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { logDemand } from "@/lib/demand";

/**
 * View-tracking for the Fresh Today viewer (Slice 11, Part E2: "view-tracking
 * per entry ... from `FoodStoryView`"). Called once per slide as it becomes
 * the active one.
 *
 * Two different things happen here, and only one needs a session:
 *  - `FoodStoryView` powers the seen/unseen card-BORDER treatment (never a
 *    ring — Part E2) and is opaque per-user standing, so it is written only
 *    for an authenticated viewer (the model's own comment: "opaque userId, so
 *    an anonymous viewer records nothing").
 *  - The `STORY_VIEW` demand event is the aggregate reach signal Part E7 wants
 *    ("gives sellers a simple reach number") and fires for EVERY viewer,
 *    authenticated or not — the same asymmetry Slice 9 already established
 *    between LISTING_VIEW (fires regardless of auth) and the save/follow rows
 *    that only exist for a signed-in user.
 */
export async function recordStoryView(storyId: string): Promise<void> {
  const story = await prisma.foodStory.findUnique({
    where: { id: storyId },
    select: { sellerId: true },
  });
  if (!story) return;

  const session = await getFoodSession();

  if (session) {
    try {
      await prisma.foodStoryView.upsert({
        where: { storyId_userId: { storyId, userId: session.userId } },
        create: { storyId, userId: session.userId },
        update: {},
      });
    } catch (err) {
      // Fire-and-forget from the caller's perspective (see the client
      // viewer) — a view row failing to write must never break playback.
      console.error("[stories] failed to upsert FoodStoryView", err);
    }
  }

  logDemand({ kind: "STORY_VIEW", sellerId: story.sellerId, userId: session?.userId ?? null });
}
