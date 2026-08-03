import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFoodSession, type FoodSession } from "@/lib/session";
import { requireOwnSeller } from "@/lib/seller";

/**
 * The order domain: ownership resolution and the queries the seller inbox and
 * the buyer's own order pages read (Slice 17).
 *
 * ⚠ Same rule as `lib/seller.ts`'s `requireOwnSeller` / `lib/listing.ts`'s
 * `requireOwnListing`: ownership comes from the SESSION, never from an id in
 * the request. Both guards below scope the lookup by `{ id, sellerId }` /
 * `{ id, clientId }` — never by order id alone — so "view someone else's
 * order" is not a request shape that exists.
 */

export async function requireOwnOrderAsSeller(
  orderId: string,
): Promise<{ session: FoodSession; sellerId: string } | null> {
  const ctx = await requireOwnSeller();
  if (!ctx) return null;
  const order = await prisma.foodOrder.findFirst({
    where: { id: orderId, sellerId: ctx.seller.id },
    select: { id: true },
  });
  if (!order) return null;
  return { session: ctx.session, sellerId: ctx.seller.id };
}

export async function requireOwnOrderAsClient(
  orderId: string,
): Promise<{ session: FoodSession } | null> {
  const session = await getFoodSession();
  if (!session) return null;
  const order = await prisma.foodOrder.findFirst({
    where: { id: orderId, clientId: session.userId },
    select: { id: true },
  });
  if (!order) return null;
  return { session };
}

// ── Order numbers ────────────────────────────────────────────────────────────

/**
 * Short human code both parties quote to each other (Part D: `"FD-4821"`).
 * Same check-then-write-retry shape as `lib/slug.ts`'s `firstFreeSlug` callers
 * — two orders created in the same instant can both be handed the same
 * number, and the loser retries on `P2002` rather than holding a lock across
 * the whole create.
 */
function randomOrderNumber(): string {
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `FD-${n}`;
}

export async function createOrderWithRetry<T>(
  create: (orderNumber: string) => Promise<T>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await create(randomOrderNumber());
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return null;
}

// ── Seller inbox ─────────────────────────────────────────────────────────────

const SELLER_ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMode: true,
  fulfillmentAt: true,
  subtotalCents: true,
  respondBy: true,
  createdAt: true,
  items: { select: { titleSnapshot: true, quantity: true } },
} satisfies Prisma.FoodOrderSelect;

export type SellerOrderSummary = Prisma.FoodOrderGetPayload<{ select: typeof SELLER_ORDER_LIST_SELECT }>;

/** PENDING first (the brief's own wording), soonest `respondBy` first within it; everything else newest first. */
export async function sellerOrderSummaries(
  sellerId: string,
): Promise<{ pending: SellerOrderSummary[]; other: SellerOrderSummary[] }> {
  const [pending, other] = await Promise.all([
    prisma.foodOrder.findMany({
      where: { sellerId, status: "PENDING" },
      select: SELLER_ORDER_LIST_SELECT,
      orderBy: { respondBy: "asc" },
    }),
    prisma.foodOrder.findMany({
      where: { sellerId, status: { not: "PENDING" } },
      select: SELLER_ORDER_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { pending, other };
}

const SELLER_ORDER_DETAIL_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  clientId: true,
  fulfillmentMode: true,
  fulfillmentAt: true,
  fulfillmentAreaOrNote: true,
  subtotalCents: true,
  customerNote: true,
  respondBy: true,
  createdAt: true,
  acceptedAt: true,
  declinedAt: true,
  completedAt: true,
  cancelledAt: true,
  expiredAt: true,
  declineReason: true,
  cancellationReason: true,
  items: {
    select: { id: true, listingId: true, titleSnapshot: true, priceCentsSnapshot: true, quantity: true, note: true },
  },
} satisfies Prisma.FoodOrderSelect;

export type SellerOrderDetail = NonNullable<Awaited<ReturnType<typeof sellerOrderDetail>>>;

export async function sellerOrderDetail(orderId: string, sellerId: string) {
  return prisma.foodOrder.findFirst({
    where: { id: orderId, sellerId },
    select: SELLER_ORDER_DETAIL_SELECT,
  });
}

// ── Buyer's own orders ───────────────────────────────────────────────────────

const CLIENT_ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMode: true,
  fulfillmentAt: true,
  subtotalCents: true,
  createdAt: true,
  items: { select: { titleSnapshot: true, quantity: true } },
  seller: { select: { displayName: true, slug: true } },
} satisfies Prisma.FoodOrderSelect;

export type ClientOrderSummary = Prisma.FoodOrderGetPayload<{ select: typeof CLIENT_ORDER_LIST_SELECT }>;

export async function clientOrderSummaries(clientId: string): Promise<ClientOrderSummary[]> {
  return prisma.foodOrder.findMany({
    where: { clientId },
    select: CLIENT_ORDER_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

const CLIENT_ORDER_DETAIL_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMode: true,
  fulfillmentAt: true,
  fulfillmentAreaOrNote: true,
  subtotalCents: true,
  customerNote: true,
  respondBy: true,
  createdAt: true,
  acceptedAt: true,
  declinedAt: true,
  completedAt: true,
  cancelledAt: true,
  expiredAt: true,
  declineReason: true,
  cancellationReason: true,
  items: { select: { id: true, titleSnapshot: true, priceCentsSnapshot: true, quantity: true, note: true } },
  seller: {
    select: { id: true, displayName: true, slug: true, profileImageThumb: true, profileImageBlur: true },
  },
} satisfies Prisma.FoodOrderSelect;

export type ClientOrderDetail = NonNullable<Awaited<ReturnType<typeof clientOrderDetail>>>;

export async function clientOrderDetail(orderId: string, clientId: string) {
  return prisma.foodOrder.findFirst({
    where: { id: orderId, clientId },
    select: CLIENT_ORDER_DETAIL_SELECT,
  });
}
