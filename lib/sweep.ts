import { prisma } from "@/lib/prisma";
import { deleteMedia } from "@/lib/storage";
import { notifyUser, notifyOrderExpired } from "@/lib/notifications";
import { OPEN_ORDER_STATUSES, THREAD_IDLE_RETENTION_DAYS, orderIsActive } from "@/lib/thread";

/**
 * `food-sweep` — the scheduled job(s), kept separate from the CLI/PM2 runner
 * (`scripts/sweep.ts`) so a future manual/debug invocation or a test can call
 * a job directly, mirroring Salon's `lib/sweeps.ts` / `scripts/sweep.ts` split
 * (the ecosystem's own precedent — BUILD_SLICES.md conventions: "Expiry sweep
 * job pattern ... reused for Story expiry and stale-order expiry"). Slices
 * 17/18 add order-expiry jobs here later; this file is where they land.
 * ⚠ Slice 17 built both order jobs below; Slice 18 adds no NEW job here — its
 * own contribution is `sweepExpiredOrders` now sending a real email alongside
 * the notification row it already wrote (Part E6's "order lifecycle ...
 * expired ... immediate"), since a sweep has no live session to email from.
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
    select: {
      id: true,
      clientId: true,
      clientEmail: true,
      orderNumber: true,
      seller: { select: { displayName: true } },
    },
  });
  if (candidates.length === 0) return 0;

  await prisma.foodOrder.updateMany({
    where: { id: { in: candidates.map((o) => o.id) } },
    data: { status: "EXPIRED", expiredAt: now },
  });

  await Promise.all(candidates.map((o) => notifyOrderExpired(o, o.seller)));

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

/**
 * PC-1 · thread retention — the answer to "what cleans this up now?".
 *
 * ⚠ **Before PC-1 there was no thread retention job because there did not need
 * to be one:** `FoodOrderMessage` cascaded from `FoodOrder`, so deleting an
 * order took its conversation with it. Lifting conversation off the order
 * removed the only cleanup this data had, which is why the 2026-08-19 ruling
 * asks for a retention story in the same breath as the thread itself. This is
 * that story.
 *
 * **The rule:** a thread is deleted when it has had no message for
 * `THREAD_IDLE_RETENTION_DAYS` (12 months, the user's own figure — chosen to
 * clear a seasonal reorder cycle, so last Christmas's baker is still reachable
 * this Christmas) AND the pair has no order that is still ACTIVE (not merely
 * one whose status still looks open). Messages go with it via
 * `ON DELETE CASCADE`.
 *
 * ⚠ **The active-order clause is a safety interlock, not a nicety.** A pair can
 * have a live ACCEPTED order for a fulfilment date a year out (a wedding cake,
 * a Christmas catering booking) with a quiet thread — deleting the
 * conversation about an order that has not happened yet would destroy exactly
 * the arrangements both parties are relying on. Idleness alone is not evidence
 * that a relationship is over.
 *
 * ⚠ **But "open" must not mean "immortal", which is why the test is
 * `orderIsActive` and not a status check.** An ACCEPTED order has no automatic
 * exit in this app — only the seller marks COMPLETED — so one abandoned years
 * ago would otherwise preserve its thread permanently, and the interlock would
 * quietly become a leak.
 *
 * ⚠ **Attachment files are deleted BEFORE the rows**, the reverse of
 * `sweepExpiredStories`'s deliberate inversion above, and for the reason that
 * function's own note gives: a story is discarded outright, whereas here a
 * crash between the two steps must not leave a thread whose photos 404 in a
 * conversation either party can still open. An orphaned file is disk waste; an
 * orphaned reference is a broken thread.
 *
 * Returns the number of threads removed.
 */
export async function sweepIdleThreads(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - THREAD_IDLE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.foodThread.findMany({
    where: {
      // `lastMessageAt` is null only for a thread whose first message has not
      // landed yet; `createdAt` covers it so a row created and abandoned in the
      // same instant is not immortal.
      OR: [{ lastMessageAt: { lt: cutoff } }, { AND: [{ lastMessageAt: null }, { createdAt: { lt: cutoff } }] }],
    },
    select: {
      id: true,
      sellerId: true,
      clientId: true,
      messages: { where: { attachmentPath: { not: null } }, select: { attachmentPath: true } },
    },
  });
  if (candidates.length === 0) return 0;

  // One query for the interlock rather than one per candidate. The status
  // filter narrows in the database; `orderIsActive` then decides per row.
  const openOrders = await prisma.foodOrder.findMany({
    where: {
      status: { in: OPEN_ORDER_STATUSES },
      OR: candidates.map((t) => ({ sellerId: t.sellerId, clientId: t.clientId })),
    },
    select: { sellerId: true, clientId: true, status: true, respondBy: true, fulfillmentAt: true },
  });
  // ⚠ **Open is not the same as active, and using the former here would make
  // threads immortal.** Nothing in this app auto-closes an ACCEPTED order — only
  // the seller marks COMPLETED — so an order whose fulfilment date passed years
  // ago still carries an open-looking status and would shield its conversation
  // forever. `orderIsActive` is the real test: a PENDING request inside its
  // `respondBy` window, or an ACCEPTED booking whose date (plus grace) has not
  // passed. See `lib/thread.ts` for why it deliberately does not CLOSE such an
  // order — that is an order-lifecycle decision, not a cleanup job's business.
  const shielded = new Set(
    openOrders.filter((o) => orderIsActive(o, now)).map((o) => `${o.sellerId}:${o.clientId}`),
  );

  const doomed = candidates.filter((t) => !shielded.has(`${t.sellerId}:${t.clientId}`));
  if (doomed.length === 0) return 0;

  await Promise.all(
    doomed.flatMap((t) =>
      t.messages.map((m) => deleteMedia(m.attachmentPath as string)),
    ),
  );

  const { count } = await prisma.foodThread.deleteMany({ where: { id: { in: doomed.map((t) => t.id) } } });
  return count;
}
