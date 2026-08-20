import { Prisma, type OrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFoodSession, type FoodSession } from "@/lib/session";
import { requireOwnSeller } from "@/lib/seller";

/**
 * PC-1 — the persistent buyer↔seller conversation domain.
 *
 * Ruled 2026-08-19 (`Apoyo-Demia/PRE_LAUNCH_CHECKLIST.md` §5). Supersedes
 * `Apoyo_Food_Architecture.md` Part D's "one thread per order — no separate
 * thread entity is needed in MVP": a thread now spans every order a pair ever
 * transacts, so a buyer can ask about next weekend's menu or negotiate a
 * custom order with no live order open.
 *
 * ⚠ **This file is where the anti-spam gate lives, and it is the load-bearing
 * part of the whole feature.** Order-scoping used to make unsolicited contact
 * structurally impossible — no order, no thread, no composer. Lifting the
 * conversation off the order removes that for free, so `resolveThreadAccess`
 * replaces it explicitly. Apparel needed a whole `ApparelContactEvent` reveal
 * step for the same problem; Food gets the equivalent from "you have ordered
 * from this seller at least once".
 *
 * ⚠ **A `FoodThread` row is a container, never a permission.** It is created
 * the moment a first order's chat starts and it outlives every order. Never
 * infer "may message" from "thread exists" — always ask
 * `resolveThreadAccess`, which re-derives the answer from live order state and
 * the seller's current setting on every call.
 *
 * Ownership follows the same rule as `lib/order.ts` and `lib/seller.ts`: it
 * comes from the SESSION, never from an id in the request. Both guards below
 * scope by `{ id, sellerId }` / `{ id, clientId }` — "read someone else's
 * thread" is not a request shape that exists.
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

/**
 * `decideThreadAccess` against live data. Two `count`s rather than one fetch of
 * the pair's orders: this runs on every thread render AND on every send, and
 * neither caller needs the rows.
 */
export async function resolveThreadAccess(
  sellerId: string,
  clientId: string,
  /** Passed when the caller already holds the seller row, to save a query. */
  sellerAllowsPostOrder?: boolean,
  now: Date = new Date(),
): Promise<ThreadAccess> {
  const [openCandidates, engagedCount, seller] = await Promise.all([
    // ⚠ Rows, not a count: "open" is a status filter the database can do, but
    // "active" needs each row's own dates (`orderIsActive`). The status filter
    // still runs in the query, so this reads at most the pair's live orders —
    // in practice a handful.
    prisma.foodOrder.findMany({
      where: { sellerId, clientId, status: { in: OPEN_ORDER_STATUSES } },
      select: { status: true, respondBy: true, fulfillmentAt: true },
    }),
    prisma.foodOrder.count({ where: { sellerId, clientId, status: { in: ENGAGED_ORDER_STATUSES } } }),
    sellerAllowsPostOrder === undefined
      ? prisma.foodSeller.findUnique({ where: { id: sellerId }, select: { postOrderMessaging: true } })
      : Promise.resolve(null),
  ]);

  return decideThreadAccess({
    // ⚠ One definition of "active" for the write gate and for retention. Two
    // would be a bug waiting to happen: a stale ACCEPTED order that no longer
    // shields a thread from deletion must not still grant write access to an
    // opted-out seller's inbox either.
    hasOpenOrder: openCandidates.some((order) => orderIsActive(order, now)),
    hasEngagedOrder: engagedCount > 0,
    // A seller row that vanished mid-request is treated as opted out — the
    // conservative direction, and unreachable in practice (`onDelete: Restrict`).
    sellerAllowsPostOrder: sellerAllowsPostOrder ?? seller?.postOrderMessaging ?? false,
  });
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * The pair's thread, created if this is their first message.
 *
 * `upsert` on the `(sellerId, clientId)` unique index rather than
 * find-then-create: two messages sent in the same instant would both see "no
 * thread" and both try to create one, and the loser would take a P2002 in the
 * middle of a send. Same reasoning as `lib/order.ts`'s
 * `createOrderWithRetry`, solved one layer lower because a unique constraint
 * exists here to upsert against.
 *
 * ⚠ Calling this does NOT check the gate — it is the write half, and every
 * caller must have already passed `resolveThreadAccess`. Kept separate rather
 * than folded together because the read surfaces (rendering a thread the buyer
 * may no longer write to) need one without the other.
 */
export async function resolveThread(
  sellerId: string,
  clientId: string,
  clientEmail: string | null,
): Promise<{ id: string }> {
  return prisma.foodThread.upsert({
    where: { sellerId_clientId: { sellerId, clientId } },
    // Refreshed on every send that carries one, so a buyer who changes their
    // address doesn't leave the sweep and the email fan-out on a stale one.
    // Never overwritten with null — a send from a session with no email claim
    // must not erase a good snapshot.
    update: clientEmail ? { clientEmail } : {},
    create: { sellerId, clientId, clientEmail },
    select: { id: true },
  });
}

// ── Ownership guards ─────────────────────────────────────────────────────────

export async function requireOwnThreadAsSeller(
  threadId: string,
): Promise<{ session: FoodSession; sellerId: string; clientId: string } | null> {
  const ctx = await requireOwnSeller();
  if (!ctx) return null;
  const thread = await prisma.foodThread.findFirst({
    where: { id: threadId, sellerId: ctx.seller.id },
    select: { clientId: true },
  });
  if (!thread) return null;
  return { session: ctx.session, sellerId: ctx.seller.id, clientId: thread.clientId };
}

export async function requireOwnThreadAsClient(
  threadId: string,
): Promise<{ session: FoodSession; sellerId: string; clientId: string } | null> {
  const session = await getFoodSession();
  if (!session) return null;
  const thread = await prisma.foodThread.findFirst({
    where: { id: threadId, clientId: session.userId },
    select: { sellerId: true },
  });
  if (!thread) return null;
  return { session, sellerId: thread.sellerId, clientId: session.userId };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * One message shape, rendered identically by the order page and the thread page
 * on both surfaces. Exported so `lib/order.ts` reads from the same definition
 * rather than keeping a second copy that can drift.
 */
export const MESSAGE_SELECT = {
  id: true,
  senderUserId: true,
  originalText: true,
  originalLocale: true,
  translations: true,
  attachmentPath: true,
  attachmentKind: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.FoodMessageSelect;

const THREAD_LIST_SELECT = {
  id: true,
  sellerId: true,
  clientId: true,
  clientEmail: true,
  lastMessageAt: true,
  messages: {
    select: { id: true, senderUserId: true, originalText: true, attachmentKind: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} satisfies Prisma.FoodThreadSelect;

export type ThreadSummary = Prisma.FoodThreadGetPayload<{ select: typeof THREAD_LIST_SELECT }> & {
  /** Messages from the counterpart this viewer hasn't opened yet. */
  unreadCount: number;
};

/**
 * Attaches per-thread unread counts in ONE grouped query rather than N counts —
 * a seller with a long customer list would otherwise pay a query per row just
 * to render a badge. "Unread" is always counterpart-authored and `readAt IS
 * NULL`; a viewer's own messages are never unread to them.
 */
async function withUnreadCounts<T extends { id: string }>(
  threads: T[],
  viewerUserId: string,
): Promise<(T & { unreadCount: number })[]> {
  if (threads.length === 0) return [];
  const grouped = await prisma.foodMessage.groupBy({
    by: ["threadId"],
    where: {
      threadId: { in: threads.map((t) => t.id) },
      senderUserId: { not: viewerUserId },
      readAt: null,
    },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((g) => [g.threadId, g._count._all]));
  return threads.map((t) => ({ ...t, unreadCount: counts.get(t.id) ?? 0 }));
}

/** The seller's Messages section — every conversation, most recent first. */
export async function sellerThreadSummaries(sellerId: string, viewerUserId: string): Promise<ThreadSummary[]> {
  const threads = await prisma.foodThread.findMany({
    where: { sellerId },
    select: THREAD_LIST_SELECT,
    // `lastMessageAt` is null only for a thread created microseconds ago whose
    // first message hasn't landed; `nulls: "last"` keeps it off the top.
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
  });
  return withUnreadCounts(threads, viewerUserId);
}

/** The buyer's own list. Same shape, scoped the other way. */
export async function clientThreadSummaries(clientId: string): Promise<(ThreadSummary & { seller: SellerBadge })[]> {
  const threads = await prisma.foodThread.findMany({
    where: { clientId },
    select: { ...THREAD_LIST_SELECT, seller: { select: SELLER_BADGE_SELECT } },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
  });
  return withUnreadCounts(threads, clientId);
}

const SELLER_BADGE_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  profileImageThumb: true,
  profileImageBlur: true,
  postOrderMessaging: true,
  messageReadReceipts: true,
} satisfies Prisma.FoodSellerSelect;

type SellerBadge = Prisma.FoodSellerGetPayload<{ select: typeof SELLER_BADGE_SELECT }>;

const THREAD_DETAIL_SELECT = {
  id: true,
  sellerId: true,
  clientId: true,
  clientEmail: true,
  createdAt: true,
  seller: { select: SELLER_BADGE_SELECT },
  messages: {
    select: { ...MESSAGE_SELECT, order: { select: { id: true, orderNumber: true } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.FoodThreadSelect;

export type ThreadDetail = NonNullable<Awaited<ReturnType<typeof threadDetail>>>;

export async function threadDetail(threadId: string) {
  return prisma.foodThread.findUnique({ where: { id: threadId }, select: THREAD_DETAIL_SELECT });
}

/** The pair's thread if it exists — the buyer's "resume where we left off" lookup. */
export async function findThreadForPair(sellerId: string, clientId: string): Promise<{ id: string } | null> {
  return prisma.foodThread.findUnique({
    where: { sellerId_clientId: { sellerId, clientId } },
    select: { id: true },
  });
}

// ── Read state ───────────────────────────────────────────────────────────────

/**
 * Called when a participant opens a conversation. Marks only the COUNTERPART'S
 * messages — a viewer's own messages are never unread to them, and stamping
 * them would silently tell the other party "read" about a message they sent.
 *
 * ⚠ Runs regardless of `FoodSeller.messageReadReceipts`. That setting governs
 * whether the buyer is SHOWN this value, nothing more: the seller's own unread
 * badges read the same column, so suppressing the write would quietly disable
 * the seller's inbox counts as a side effect of a privacy toggle.
 */
export async function markThreadRead(threadId: string, viewerUserId: string): Promise<void> {
  await prisma.foodMessage.updateMany({
    where: { threadId, senderUserId: { not: viewerUserId }, readAt: null },
    data: { readAt: new Date() },
  });
}

// ── Retention ────────────────────────────────────────────────────────────────

/**
 * How long a conversation survives with nothing happening on it. User ruling,
 * 2026-08-19: 12 months, chosen to comfortably clear a seasonal reorder pattern
 * (last Christmas's baker is still reachable this Christmas).
 *
 * ⚠ This is the ONLY cleanup this data has. Before PC-1 the order's
 * `onDelete: Cascade` was doing that job implicitly; lifting the conversation
 * off the order removed it, which is why the ruling calls for a retention story
 * in the same breath as the thread itself. See `sweepIdleThreads`.
 */
export const THREAD_IDLE_RETENTION_DAYS = 365;
