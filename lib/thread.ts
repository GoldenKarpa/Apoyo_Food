import { Prisma } from "@prisma/client";

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
 * ⚠ The gate itself lives in `lib/thread-access.ts` — a pure module importing
 * nothing but a type, so the provider demo can evaluate the REAL decision in
 * the browser against fixtures (PD-S10). Re-exported here so every existing
 * importer keeps working and there is only ever one definition of it.
 */
export {
  OPEN_ORDER_STATUSES,
  ACCEPTED_ORDER_ACTIVE_GRACE_DAYS,
  ENGAGED_ORDER_STATUSES,
  orderIsActive,
  decideThreadAccess,
} from "@/lib/thread-access";
export type { ThreadAccess, ThreadDenyReason } from "@/lib/thread-access";

import { decideThreadAccess, ENGAGED_ORDER_STATUSES, OPEN_ORDER_STATUSES, orderIsActive } from "@/lib/thread-access";
import type { ThreadAccess } from "@/lib/thread-access";

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
