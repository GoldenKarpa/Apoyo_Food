import type { OrderStatus } from "@prisma/client";

/**
 * PC-1's anti-spam gate, as a PURE decision with no I/O — extracted from
 * `lib/thread.ts` at PD-S10.
 *
 * ## ⚠ Why this file exists separately
 *
 * `lib/thread.ts` imports `@/lib/prisma`, `@/lib/session` and `@/lib/seller`,
 * so importing anything from it drags the Prisma client into whatever bundle
 * the importer lands in. The provider demo has to evaluate this gate in the
 * BROWSER, against fixtures, with no database anywhere
 * (`Apoyo-Portal/Provider_Demo_Plan.md` D5) — so the decision moved to a module
 * that imports nothing but a type.
 *
 * This is the same split this codebase already applies twice over:
 * `lib/order-status.ts`'s `decideOrderTransition` ("a pure decision function,
 * no I/O") and `lib/seller-profile.ts` vs `lib/seller.ts`. `lib/thread.ts`
 * re-exports everything below, so every existing importer is unchanged and
 * there is exactly ONE definition of the gate — a second one would be the bug
 * this whole feature is most exposed to.
 */

// ── The gate ─────────────────────────────────────────────────────────────────

/**
 * An order that is still live. Chat about one of these is ALWAYS allowed, in
 * both directions, regardless of the seller's post-order setting — coordinating
 * an in-flight order ("can you do 6pm instead?") is not the thing the opt-out
 * exists to silence, and blocking it would break the order flow itself.
 *
 * ⚠ **Status alone is a necessary but NOT sufficient test** — see
 * `orderIsActive` below. These two statuses are the candidate set; whether a
 * given row is genuinely still active is a question about its own dates.
 */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ["PENDING", "ACCEPTED"];

/**
 * How long after its fulfilment date an ACCEPTED order goes on counting as
 * active.
 *
 * ⚠ **This constant exists because nothing in this app ever auto-closes an
 * ACCEPTED order.** `PENDING` cannot go stale — it carries `respondBy` and
 * `sweepExpiredOrders` moves it to `EXPIRED` automatically. `ACCEPTED` has no
 * such backstop: only the seller marks `COMPLETED` (architecture E5 point 3,
 * deliberately), and `sweepOrderCompletionNudges` sends exactly one reminder
 * they are free to ignore. So an order whose fulfilment date passed two years
 * ago sits `ACCEPTED` forever, and a status-only test would let it shield its
 * thread from retention forever with it.
 *
 * 30 days is generous for the thing the grace is actually protecting: any
 * conversation that follows the event itself ("thanks!", "you left a tray").
 * It is mostly belt-and-braces, because a thread must ALSO have been silent
 * for `THREAD_IDLE_RETENTION_DAYS` before the sweep looks at it at all — a
 * 12-month silence starting after fulfilment already dwarfs this window. It is
 * stated explicitly anyway so the intent is legible rather than emergent.
 */
export const ACCEPTED_ORDER_ACTIVE_GRACE_DAYS = 30;

/**
 * Whether one order is genuinely still active *right now*, as opposed to
 * merely carrying an open-looking status.
 *
 * ⚠ **This is the fix for "open must not mean immortal".** The distinction is
 * not academic: `ACCEPTED` is the one status in this app with no automatic
 * exit, so "the pair has an open order" and "the pair has an active order" are
 * the same sentence for a week and diverge forever after that.
 *
 * Deliberately a pure function of the row plus a clock, with no database and
 * no side effects, so every branch is provable directly — the same discipline
 * as `decideThreadAccess` and `lib/order-status.ts`'s `decideOrderTransition`.
 *
 * ⚠ **It deliberately does NOT mutate the order.** Closing out a long-abandoned
 * ACCEPTED order is a real and separate problem (it also pollutes the seller's
 * order list and any future revenue analytics), but it is a change to the
 * business record of a real-world transaction, with notifications and history
 * attached. Deciding that inside a retention sweep would hide a lifecycle
 * decision inside a cleanup job. This function answers only "does this row
 * still justify protecting a conversation", and leaves the order untouched.
 */
export function orderIsActive(
  order: { status: OrderStatus; respondBy: Date; fulfillmentAt: Date },
  now: Date = new Date(),
): boolean {
  // A request still inside its response window. Past `respondBy` it is dead in
  // all but name — `sweepExpiredOrders` runs earlier in the very same tick and
  // will have moved it to EXPIRED — but this must not DEPEND on that job having
  // run, or a stalled sweep would silently make threads immortal again.
  if (order.status === "PENDING") return order.respondBy.getTime() > now.getTime();

  // A booking whose date hasn't passed yet (a wedding cake 18 months out is the
  // case the whole interlock exists for), plus the grace window after it.
  if (order.status === "ACCEPTED") {
    return order.fulfillmentAt.getTime() + ACCEPTED_ORDER_ACTIVE_GRACE_DAYS * 24 * 60 * 60 * 1000 > now.getTime();
  }

  // COMPLETED / DECLINED / CANCELLED_* / EXPIRED — all terminal. A finished or
  // abandoned order protects nothing.
  return false;
}

/**
 * ⚠ **The anti-spam gate's actual definition: an order the seller ENGAGED
 * with.** The ruling's words are "at least one order between that pair, past
 * or present"; this list is that rule made precise, and the precision matters.
 *
 * `PENDING` and `EXPIRED` are deliberately absent. Both describe a request the
 * seller never responded to, and a stranger can create one unilaterally — if
 * either granted a permanent channel, "place a request, ignore the 24h expiry,
 * message forever" would be a one-click spam key, which is exactly the surface
 * order-scoping used to close.
 *
 * `DECLINED` and both `CANCELLED_*` values ARE present, and that is not
 * leniency. A declined order is the single most natural trigger for the
 * conversation this feature is for — "not this Saturday, but could you do the
 * following one?" — and it required the seller to actually respond, which a
 * spammer cannot force. The line is engagement, not success.
 *
 * ⚠ Chat during a PENDING order still works (via `OPEN_ORDER_STATUSES`), so
 * placing a request does buy a spammer a 24-hour window — but that is exactly
 * today's behaviour, unchanged by this feature, and `respondBy` closes it
 * automatically. What PC-1 must not do is turn that window into a permanent
 * one.
 */
export const ENGAGED_ORDER_STATUSES: OrderStatus[] = [
  "ACCEPTED",
  "COMPLETED",
  "DECLINED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
];

export type ThreadDenyReason =
  /** No engaged order between this pair — the gate. The buyer is never told a thread could exist. */
  | "orderRequired"
  /** The seller has opted out of post-order conversation and nothing is open right now. */
  | "activeOrdersOnly";

export interface ThreadAccess {
  canWrite: boolean;
  /** `null` when `canWrite` — a reason only exists for a refusal. */
  reason: ThreadDenyReason | null;
  /** True while any order between the pair is PENDING or ACCEPTED. */
  hasOpenOrder: boolean;
  /** True once the seller has engaged with at least one order from this buyer. */
  hasEngagedOrder: boolean;
}

/**
 * The decision, extracted from its data so a verification script can prove
 * every branch directly with no database and no clock — the same discipline
 * `lib/order-status.ts`'s `decideOrderTransition` and
 * `lib/notifications.ts`'s `shouldSendDebouncedEmail` follow.
 *
 * ⚠ **Branch order is load-bearing, not stylistic.** `orderRequired` is tested
 * BEFORE the seller's opt-out so that a stranger with no order history is told
 * only "you cannot message" — never "this seller has turned messaging off",
 * which would leak a seller's private preference to anyone who asked. A buyer
 * who has actually transacted is the only party who learns the setting exists,
 * and per the 2026-08-19 UX ruling they are told explicitly rather than shown a
 * silently missing composer.
 */
export function decideThreadAccess(input: {
  hasOpenOrder: boolean;
  hasEngagedOrder: boolean;
  sellerAllowsPostOrder: boolean;
}): ThreadAccess {
  const { hasOpenOrder, hasEngagedOrder, sellerAllowsPostOrder } = input;
  const base = { hasOpenOrder, hasEngagedOrder };

  // 1. A live order always carries its own conversation. The opt-out narrows
  //    chat TO open orders; it never removes it FROM them.
  if (hasOpenOrder) return { canWrite: true, reason: null, ...base };

  // 2. The gate. Checked before the setting — see the note above.
  if (!hasEngagedOrder) return { canWrite: false, reason: "orderRequired", ...base };

  // 3. The escape hatch, for a seller who finds post-order chat noisy.
  if (!sellerAllowsPostOrder) return { canWrite: false, reason: "activeOrdersOnly", ...base };

  return { canWrite: true, reason: null, ...base };
}
