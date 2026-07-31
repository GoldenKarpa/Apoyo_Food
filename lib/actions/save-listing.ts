"use server";

import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { ensureFoodClientMembership } from "@/lib/auth-guards";
import { logDemand } from "@/lib/demand";

/**
 * Save/favourite (architecture Part C: "`(FOOD, CLIENT)` minted lazily on first
 * commitment"). A Server Action, not an API route — `<SaveButton>` calls this
 * directly, with no hand-written fetch/JSON layer in between.
 *
 * ⚠ **No sign-in redirect for the unauthenticated case, and this is not an
 * oversight.** This is the exact question Apparel's own Slice 10 hit first in
 * this ecosystem and had to stop and ask the user about: Food has no client
 * login door of its own yet (`/login` is still Slice 1's placeholder — no slice
 * in Phases 0–3 builds one, per BUILD_SLICES.md's `buyerAccount` stub note),
 * and the ecosystem's cross-vertical login flow carries a hard rule that one
 * vertical's URL/brand must never be surfaced to another vertical's visitor as
 * a redirect target. `<SaveButton>` shows an inline "sign in to save" hint and
 * stops there; wiring a real destination is separate, future work once Food's
 * own login door is built — tracked in BUILD_SLICES.md, not invented here.
 */
export type ToggleSaveResult =
  | { ok: true; saved: boolean }
  | { ok: false; reason: "unauthenticated" | "not_found" };

export async function toggleSaveListing(listingId: string): Promise<ToggleSaveResult> {
  const session = await getFoodSession();
  if (!session) return { ok: false, reason: "unauthenticated" };

  const existing = await prisma.foodSave.findUnique({
    where: { userId_listingId: { userId: session.userId, listingId } },
  });

  if (existing) {
    await prisma.foodSave.delete({ where: { id: existing.id } });
    return { ok: true, saved: false };
  }

  const listing = await prisma.foodListing.findUnique({
    where: { id: listingId },
    select: { sellerId: true },
  });
  if (!listing) return { ok: false, reason: "not_found" };

  // Best-effort, deliberately: the ecosystem membership is supplementary
  // standing (Slice 3), not the user-facing commitment — the FoodSave row is.
  // A transient ecosystem-API hiccup must not turn a heart-tap into a failed
  // save, the same resilience posture lib/demand.ts already takes for its own
  // writes.
  try {
    await ensureFoodClientMembership(session.userId);
  } catch (err) {
    console.error("[save] ensureFoodClientMembership failed — save still proceeds", err);
  }

  await prisma.foodSave.create({ data: { userId: session.userId, listingId } });
  // Only on the positive transition — Slice 9's discovery notes are explicit
  // that an unsave is not a demand signal.
  logDemand({ kind: "SAVE", listingId, sellerId: listing.sellerId, userId: session.userId });

  return { ok: true, saved: true };
}
