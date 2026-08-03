import { prisma } from "@/lib/prisma";
import { deleteMedia } from "@/lib/storage";
import { notifyUser } from "@/lib/notifications";

/**
 * `food-sweep` — the scheduled job(s), kept separate from the CLI/PM2 runner
 * (`scripts/sweep.ts`) so a future manual/debug invocation or a test can call
 * a job directly, mirroring Salon's `lib/sweeps.ts` / `scripts/sweep.ts` split
 * (the ecosystem's own precedent — BUILD_SLICES.md conventions: "Expiry sweep
 * job pattern ... reused for Story expiry and stale-order expiry"). Slices
 * 17/18 add order-expiry jobs here later; this file is where they land.
 * ⚠ Slice 17 is that "later" for the two order jobs below — Slice 18 adds
 * nothing further here; its own notifications ride the existing rows.
 */

/**
 * Fresh Today expiry (architecture Part E2): "`food-sweep` marks/clears
 * expired entries every few minutes."
 *
 * ⚠ **A highlighted story is NEVER swept, however old.** `FoodStory.highlightId
 * != null` means it is kept on the Menu shelf — Part E2: "Highlighted entries
 * persist on the profile" — and that is a property of the row's OWN
 * `highlightId`, not of `expiresAt`. `expiresAt` still governs whether a
 * highlighted story appears in the Fresh Today VIEWER's "active stories"
 * (`lib/stories.ts`'s `sellerActiveStories` filters on it regardless of
 * highlight status) — only the SWEEP treats a highlight as an exemption, and
 * only from deletion. This is the literal mechanism behind the slice's own
 * done-when: "expiry sweep clears an aged post -> highlight persists on the
 * Menu shelf" describes TWO outcomes from ONE pass, not two different jobs.
 *
 * Row deleted before files: the reverse order used everywhere else in this
 * app (delete files, then the row) is deliberately inverted HERE, because an
 * expired-and-ephemeral story is being discarded outright, not replaced — a
 * crash between the two steps leaves an orphaned file (disk waste, swept up
 * by nothing today) rather than a row pointing at deleted media (which would
 * 404 mid-render on the one code path that still reads it, `sellerStoryQueue`,
 * for the seconds between the two steps).
 */
export async function sweepExpiredStories(now: Date = new Date()): Promise<number> {
  const expired = await prisma.foodStory.findMany({
    where: { expiresAt: { lte: now }, highlightId: null },
    select: { id: true, pathThumb: true, pathCard: true, pathFull: true },
  });
  if (expired.length === 0) return 0;

  await prisma.foodStory.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } });

  await Promise.all(
    expired.flatMap((s) => [deleteMedia(s.pathThumb), deleteMedia(s.pathCard), deleteMedia(s.pathFull)]),
  );

  return expired.length;
}

/**
 * Order expiry (Slice 17, architecture E5): "No response by `respondBy` ->
 * sweep marks `EXPIRED`, customer notified... a request must never die
 * silently." The `WHERE status = "PENDING"` clause below IS the validity
 * check `lib/order-status.ts`'s `decideOrderTransition` encodes for `expire`
 * (`VALID_FROM.expire = ["PENDING"]`) — a bulk sweep over a query that already
 * excludes every other status needs no per-row re-derivation of the same rule.
 */
export async function sweepExpiredOrders(now: Date = new Date()): Promise<number> {
  const candidates = await prisma.foodOrder.findMany({
    where: { status: "PENDING", respondBy: { lte: now } },
    select: { id: true, clientId: true, orderNumber: true },
  });
  if (candidates.length === 0) return 0;

  await prisma.foodOrder.updateMany({
    where: { id: { in: candidates.map((o) => o.id) } },
    data: { status: "EXPIRED", expiredAt: now },
  });

  await Promise.all(
    candidates.map((o) => notifyUser(o.clientId, "ORDER_EXPIRED", { orderId: o.id, orderNumber: o.orderNumber })),
  );

  return candidates.length;
}

/**
 * Completion nudge (Slice 17): an ACCEPTED order whose `fulfillmentAt` has
 * passed gets the seller a single `ORDER_REMINDER` to mark it `COMPLETED` —
 * never a status change of its own (only the seller marks completion, Part
 * E5 point 3). "Single" is the part that needs guarding: this job runs every
 * few minutes, so without a dedup check the same order would earn a fresh
 * reminder on every tick for as long as it stayed un-actioned. `FoodNotification`
 * has no unique constraint tying it to one order + kind (Part D — it is a
 * general inbox, not a per-event ledger), so the guard is a existence check
 * against the JSON payload rather than a database constraint.
 */
export async function sweepOrderCompletionNudges(now: Date = new Date()): Promise<number> {
  const candidates = await prisma.foodOrder.findMany({
    where: { status: "ACCEPTED", fulfillmentAt: { lte: now } },
    select: { id: true, orderNumber: true, seller: { select: { userId: true } } },
  });

  let notified = 0;
  for (const order of candidates) {
    const already = await prisma.foodNotification.findFirst({
      where: { kind: "ORDER_REMINDER", payload: { path: ["orderId"], equals: order.id } },
      select: { id: true },
    });
    if (already) continue;
    await notifyUser(order.seller.userId, "ORDER_REMINDER", { orderId: order.id, orderNumber: order.orderNumber });
    notified += 1;
  }

  return notified;
}
