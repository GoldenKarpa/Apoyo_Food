"use server";

import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { ensureFoodClientMembership } from "@/lib/auth-guards";
import { logDemand } from "@/lib/demand";

/**
 * Follow (Slice 11, architecture Part C) — the same shape as Slice 10's
 * `toggleSaveListing`, including its two deliberate choices, unchanged and not
 * re-litigated here: no sign-in redirect for an anonymous click (Food has no
 * client login door yet, and the ecosystem's rule against ever surfacing a
 * wrong vertical's URL to a client rules out guessing at a destination — see
 * that file's own comment), and the ecosystem membership call is best-effort
 * so a transient API hiccup can't turn a follow-tap into a failure.
 *
 * ⚠ The one real difference from Save: `followerCount` is a DENORMALIZED
 * counter that is actually DISPLAYED (the seller profile, `<SellerCard>`), so
 * every toggle **recounts the real `FoodFollow` table and writes the result**,
 * inside one transaction with the row's own create/delete — never a blind
 * increment/decrement, which would drift under any edge case (a double click,
 * a retried request, a race with Slice 8's own seed-time recount).
 */
export type ToggleFollowResult =
  | { ok: true; following: boolean; followerCount: number }
  | { ok: false; reason: "unauthenticated" | "not_found" };

export async function toggleFollowSeller(sellerId: string): Promise<ToggleFollowResult> {
  const session = await getFoodSession();
  if (!session) return { ok: false, reason: "unauthenticated" };

  const seller = await prisma.foodSeller.findUnique({ where: { id: sellerId }, select: { id: true } });
  if (!seller) return { ok: false, reason: "not_found" };

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.foodFollow.findUnique({
      where: { userId_sellerId: { userId: session.userId, sellerId } },
    });

    if (existing) {
      await tx.foodFollow.delete({ where: { id: existing.id } });
    } else {
      await tx.foodFollow.create({ data: { userId: session.userId, sellerId } });
    }

    const followerCount = await tx.foodFollow.count({ where: { sellerId } });
    await tx.foodSeller.update({ where: { id: sellerId }, data: { followerCount } });

    return { following: !existing, followerCount };
  });

  // Only on the FOLLOW transition, matching Slice 10's toggleSaveListing: the
  // ecosystem membership just needs to exist once, and an unfollow means the
  // user already committed before — calling this again there is a pure-
  // overhead no-op read. Same for the demand event.
  if (result.following) {
    try {
      await ensureFoodClientMembership(session.userId);
    } catch (err) {
      console.error("[follow] ensureFoodClientMembership failed — follow still proceeds", err);
    }
    logDemand({ kind: "FOLLOW", sellerId, userId: session.userId });
  }

  return { ok: true, ...result };
}
