"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { ensureFoodClientMembership } from "@/lib/auth-guards";
import { requireOwnOrderAsSeller, requireOwnOrderAsClient, createOrderWithRetry } from "@/lib/order";
import { decideOrderTransition, type OrderActor } from "@/lib/order-status";
import { getOrderingEnabled } from "@/lib/platform-settings";
import { validateRequestedFulfillment, localInstant } from "@/lib/availability";
import {
  isFulfillmentMode,
  isValidQuantity,
  MAX_CUSTOMER_NOTE_LENGTH,
  MAX_FULFILLMENT_AREA_LENGTH,
  MAX_ITEM_NOTE_LENGTH,
  RESPOND_BY_HOURS,
} from "@/lib/order-form";
import { parseTtdToCents } from "@/lib/listing-form";
import { DISCOVERABLE } from "@/lib/discovery";
import { logDemand } from "@/lib/demand";
import { notifyUser } from "@/lib/notifications";
import { checkRateLimit, clientIpFromHeaders, ORDER_CREATE_RULE_PER_IP, ORDER_CREATE_RULE_PER_USER } from "@/lib/rate-limit";
import type { ClientFormState } from "@/lib/actions/client-form-state";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * The order lifecycle's writes (Slice 17, architecture E5). `createOrderRequest`
 * is buyer-facing (`ClientFormState`); `acceptOrder`/`declineOrder`/
 * `completeOrder`/`cancelOrder` are the seller (and, for cancel, buyer) side.
 *
 * Every transition goes through `lib/order-status.ts`'s pure
 * `decideOrderTransition` FIRST — never an inline status check — for the same
 * reason Slice 16 split `decideSellerLifecycleAction` out: a bypass reachable
 * from the wrong starting state is exactly the class of bug a starting-state
 * table catches and an inline `if` can miss under a rename or a copy-paste.
 */

const requestSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.string(),
  itemNote: z.string().trim().max(MAX_ITEM_NOTE_LENGTH),
  fulfillmentMode: z.string(),
  dateIso: z.string(),
  time: z.string(),
  fulfillmentAreaOrNote: z.string().trim().max(MAX_FULFILLMENT_AREA_LENGTH),
  customerNote: z.string().trim().max(MAX_CUSTOMER_NOTE_LENGTH),
});

/**
 * Sign-in gate (architecture E5 step 1) and the "Coming Soon" launch gate
 * (`FoodPlatformSetting`, this slice's Custom Edit) are BOTH re-checked here,
 * server-side, in addition to gating the UI — a direct POST while the sheet is
 * hidden must fail exactly like the UI says it will, not silently succeed.
 */
export async function createOrderRequest(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const orderingEnabled = await getOrderingEnabled();
  if (!orderingEnabled) return { status: "error", error: "orderingPaused" };

  const session = await getFoodSession();
  if (!session) return { status: "error", error: "signedOut" };

  const ip = clientIpFromHeaders(await headers());
  const userLimit = checkRateLimit(`order:user:${session.userId}`, ORDER_CREATE_RULE_PER_USER);
  const ipLimit = checkRateLimit(`order:ip:${ip}`, ORDER_CREATE_RULE_PER_IP);
  if (!userLimit.ok || !ipLimit.ok) return { status: "error", error: "rateLimited" };

  const parsed = requestSchema.safeParse({
    listingId: formData.get("listingId"),
    quantity: formData.get("quantity"),
    itemNote: formData.get("itemNote") ?? "",
    fulfillmentMode: formData.get("fulfillmentMode"),
    dateIso: formData.get("dateIso"),
    time: formData.get("time"),
    fulfillmentAreaOrNote: formData.get("fulfillmentAreaOrNote") ?? "",
    customerNote: formData.get("customerNote") ?? "",
  });
  if (!parsed.success) return { status: "error", error: "unknown" };
  const { listingId, quantity, itemNote, fulfillmentMode, dateIso, time, fulfillmentAreaOrNote, customerNote } =
    parsed.data;

  const quantityValue = Number(quantity);
  if (!isValidQuantity(quantityValue)) return { status: "error", error: "quantity" };

  if (!isFulfillmentMode(fulfillmentMode)) return { status: "error", error: "fulfillmentMode" };

  const listing = await prisma.foodListing.findFirst({
    where: { id: listingId, ...DISCOVERABLE },
    select: {
      id: true,
      title: true,
      priceMode: true,
      priceCents: true,
      availabilityWindows: {
        select: { type: true, daysOfWeek: true, startsOn: true, endsOn: true, leadTimeDays: true },
      },
      seller: { select: { id: true, userId: true, fulfillmentModes: true } },
    },
  });
  if (!listing) return { status: "error", error: "noListing" };
  if (!listing.seller.fulfillmentModes.includes(fulfillmentMode)) {
    return { status: "error", error: "fulfillmentMode" };
  }

  const requestedAt = localInstant(dateIso, time);
  if (Number.isNaN(requestedAt.getTime())) return { status: "error", error: "invalidDate" };

  const validation = validateRequestedFulfillment(listing.availabilityWindows, requestedAt);
  if (!validation.ok) {
    if (validation.reason === "leadTime") {
      return { status: "error", error: "leadTime", minLeadDays: validation.minLeadDays };
    }
    return { status: "error", error: validation.reason === "past" ? "past" : "outOfWindow" };
  }

  const priceCentsSnapshot = listing.priceMode === "QUOTE" ? null : listing.priceCents;
  const subtotalCents = priceCentsSnapshot !== null ? priceCentsSnapshot * quantityValue : null;

  try {
    await ensureFoodClientMembership(session.userId);
  } catch (err) {
    console.error("[order] ensureFoodClientMembership failed — request still proceeds", err);
  }

  const respondBy = new Date(Date.now() + RESPOND_BY_HOURS * 60 * 60 * 1000);

  const created = await createOrderWithRetry((orderNumber) =>
    prisma.foodOrder.create({
      data: {
        orderNumber,
        clientId: session.userId,
        sellerId: listing.seller.id,
        fulfillmentMode,
        fulfillmentAt: requestedAt,
        fulfillmentAreaOrNote: fulfillmentAreaOrNote || null,
        subtotalCents,
        customerNote: customerNote || null,
        respondBy,
        items: {
          create: {
            listingId: listing.id,
            titleSnapshot: listing.title,
            priceCentsSnapshot,
            quantity: quantityValue,
            note: itemNote || null,
          },
        },
      },
      select: { id: true, orderNumber: true },
    }),
  );
  if (!created) return { status: "error", error: "unknown" };

  logDemand({ kind: "ORDER_PLACED", listingId: listing.id, sellerId: listing.seller.id, userId: session.userId });
  await notifyUser(listing.seller.userId, "ORDER_PLACED", {
    orderId: created.id,
    orderNumber: created.orderNumber,
    listingTitle: listing.title,
  });

  revalidatePath("/orders");
  revalidatePath("/food/orders");

  return { status: "ok", orderId: created.id, orderNumber: created.orderNumber };
}

function revalidateOrderPaths(orderId: string): void {
  revalidatePath("/food/orders");
  revalidatePath(`/food/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

// ── Seller: accept (with per-item quote pricing) ─────────────────────────────

export async function acceptOrder(
  orderId: string,
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnOrderAsSeller(orderId);
  if (!ctx) return { status: "error", error: "noOrder" };

  const order = await prisma.foodOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      clientId: true,
      orderNumber: true,
      items: { select: { id: true, priceCentsSnapshot: true } },
    },
  });

  const decision = decideOrderTransition(order, "accept", "seller");
  if (!decision.ok) return { status: "error", error: "orderInvalidTransition" };

  const updates: { id: string; priceCents: number }[] = [];
  for (const item of order.items) {
    const raw = formData.get(`price-${item.id}`);
    const rawStr = raw === null ? "" : String(raw).trim();
    if (rawStr === "") {
      // No adjustment offered — legal only when a price already exists (FIXED/
      // STARTING_AT). A QUOTE item has nothing to fall back to.
      if (item.priceCentsSnapshot === null) return { status: "error", error: "priceRequired" };
      continue;
    }
    const cents = parseTtdToCents(rawStr);
    if (cents === null) return { status: "error", error: "priceInvalid" };
    updates.push({ id: item.id, priceCents: cents });
  }

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.foodOrderItem.update({ where: { id: u.id }, data: { priceCentsSnapshot: u.priceCents } });
    }
    const items = await tx.foodOrderItem.findMany({
      where: { orderId },
      select: { priceCentsSnapshot: true, quantity: true },
    });
    const subtotalCents = items.reduce((sum, it) => sum + (it.priceCentsSnapshot ?? 0) * it.quantity, 0);
    await tx.foodOrder.update({
      where: { id: orderId },
      data: { status: decision.status, acceptedAt: new Date(), subtotalCents },
    });
  });

  await notifyUser(order.clientId, "ORDER_ACCEPTED", { orderId, orderNumber: order.orderNumber });
  revalidateOrderPaths(orderId);
  return { status: "ok" };
}

// ── Simple one-click transitions (decline/complete/cancel) ──────────────────

export type OrderActionResult = { ok: true } | { ok: false; reason: string };

export async function declineOrder(orderId: string, reason: string): Promise<OrderActionResult> {
  const ctx = await requireOwnOrderAsSeller(orderId);
  if (!ctx) return { ok: false, reason: "unauthorized" };

  const order = await prisma.foodOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, clientId: true, orderNumber: true },
  });
  const decision = decideOrderTransition(order, "decline", "seller");
  if (!decision.ok) return { ok: false, reason: "invalidTransition" };

  await prisma.foodOrder.update({
    where: { id: orderId },
    data: { status: decision.status, declinedAt: new Date(), declineReason: reason.trim().slice(0, 500) || null },
  });
  await notifyUser(order.clientId, "ORDER_DECLINED", { orderId, orderNumber: order.orderNumber });
  revalidateOrderPaths(orderId);
  return { ok: true };
}

export async function completeOrder(orderId: string): Promise<OrderActionResult> {
  const ctx = await requireOwnOrderAsSeller(orderId);
  if (!ctx) return { ok: false, reason: "unauthorized" };

  const order = await prisma.foodOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, clientId: true, orderNumber: true },
  });
  const decision = decideOrderTransition(order, "complete", "seller");
  if (!decision.ok) return { ok: false, reason: "invalidTransition" };

  await prisma.foodOrder.update({
    where: { id: orderId },
    data: { status: decision.status, completedAt: new Date() },
  });
  await notifyUser(order.clientId, "ORDER_COMPLETED", { orderId, orderNumber: order.orderNumber });
  revalidateOrderPaths(orderId);
  return { ok: true };
}

/**
 * Either party, before fulfilment (Part E5 point 4). `actor` decides both
 * which ownership guard runs and — via `decideOrderTransition` — which of the
 * two terminal statuses the cancellation lands on.
 */
export async function cancelOrder(
  orderId: string,
  actor: OrderActor,
  reason: string,
): Promise<OrderActionResult> {
  const ctx = actor === "seller" ? await requireOwnOrderAsSeller(orderId) : await requireOwnOrderAsClient(orderId);
  if (!ctx) return { ok: false, reason: "unauthorized" };

  const order = await prisma.foodOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, clientId: true, orderNumber: true, seller: { select: { userId: true } } },
  });
  const decision = decideOrderTransition(order, "cancel", actor);
  if (!decision.ok) return { ok: false, reason: "invalidTransition" };

  await prisma.foodOrder.update({
    where: { id: orderId },
    data: {
      status: decision.status,
      cancelledAt: new Date(),
      cancellationReason: reason.trim().slice(0, 500) || null,
    },
  });

  const notifyTarget = actor === "seller" ? order.clientId : order.seller.userId;
  await notifyUser(notifyTarget, "ORDER_CANCELLED", { orderId, orderNumber: order.orderNumber });
  revalidateOrderPaths(orderId);
  return { ok: true };
}
