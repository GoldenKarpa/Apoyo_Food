import type { NotificationKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  sendOrderPlacedEmail,
  sendOrderAcceptedEmail,
  sendOrderDeclinedEmail,
  sendOrderExpiredEmail,
  sendNewMessagesEmail,
  type EmailLocale,
} from "@/lib/email";

/**
 * In-app notifications for the order lifecycle (Slice 17, architecture E6):
 * "domain event -> `FoodNotification` row (in-app inbox, unread badge)".
 *
 * ⚠ **Scope, stated deliberately rather than silently assumed:** this slice
 * does NOT build a general `/notifications` inbox page — Part F1's sitemap
 * lists one, but no slice through 16 has built it, and Slice 18's own title
 * ("Order thread, email, notifications") repeats the word, which reads as the
 * slice that actually owns the dedicated notification-center UI plus
 * `ORDER_MESSAGE` and Resend email fan-out. Building a whole notification
 * center here would be exactly the Slice 18 scope creep the brief warns
 * against. Instead, this slice treats the two pages that already exist for
 * this exact purpose — `/food/orders[/[id]]` and `/orders[/[id]]` — as the
 * real in-app surface: every lifecycle event writes a real, queryable
 * `FoodNotification` row for the OTHER party, the seller nav shows a real
 * unread COUNT badge, and opening an order's own detail page marks that
 * order's notifications read. That is a genuine in-app notification system,
 * scoped to what this slice actually built.
 *
 * Every write here is best-effort by construction: a notification failing to
 * write must never fail the order mutation that triggered it. Mirrors
 * `lib/demand.ts`'s own posture for the same reason.
 */
export async function notifyUser(
  userId: string,
  kind: NotificationKind,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.foodNotification.create({ data: { userId, kind, payload: payload as Prisma.InputJsonValue } });
  } catch (err) {
    console.error("[notifications] failed to write", kind, (err as Error).message);
  }
}

/** Lifecycle kinds a seller nav badge / order list should count as "new". */
const ORDER_NOTIFICATION_KINDS: NotificationKind[] = [
  "ORDER_PLACED",
  "ORDER_ACCEPTED",
  "ORDER_DECLINED",
  "ORDER_EXPIRED",
  "ORDER_CANCELLED",
  "ORDER_COMPLETED",
  "ORDER_MESSAGE",
  "ORDER_REMINDER",
];

export async function unreadOrderNotificationCount(userId: string): Promise<number> {
  return prisma.foodNotification.count({
    where: { userId, readAt: null, kind: { in: ORDER_NOTIFICATION_KINDS } },
  });
}

/**
 * Marks every notification THIS user holds about ONE order as read — called
 * when they open that order's own detail page. `payload` is a JSON blob
 * (Part D), so this filters on its `orderId` field via Prisma's Postgres JSON
 * path filter rather than a real column.
 */
export async function markOrderNotificationsRead(userId: string, orderId: string): Promise<void> {
  await prisma.foodNotification.updateMany({
    where: {
      userId,
      readAt: null,
      kind: { in: ORDER_NOTIFICATION_KINDS },
      payload: { path: ["orderId"], equals: orderId },
    },
    data: { readAt: new Date() },
  });
}

// ── Slice 18: order lifecycle + thread-message email fan-out ────────────────
//
// Each function below does what `notifyUser` already did (write the in-app
// row) PLUS a best-effort transactional email for the events Slice 18's own
// brief names: "order lifecycle (placed/accepted/declined/expired) immediate;
// thread messages debounced". Deliberately NOT folded into `notifyUser`
// itself — that function's generic `Record<string, unknown>` payload doesn't
// carry enough structured data (seller email/languages, order number, a
// counterpart's display text) to build a real email, and every call site
// already has the richer objects on hand. `ORDER_CANCELLED`/`ORDER_COMPLETED`/
// `ORDER_REMINDER` stay on the plain `notifyUser` they already used in Slice
// 17 — this brief names exactly four lifecycle kinds for email, not all seven.

/**
 * The seller's own dashboard defaults Spanish (Slice 1) — with no stored
 * locale preference for a seller (the identity-lookup gap `FoodSeller.email`'s
 * own comment documents), `languages` is the closest available signal, same
 * inference Salon's own `emailLocale()` uses for the identical gap.
 */
export function sellerEmailLocale(seller: { languages: string[] }): EmailLocale {
  return seller.languages.includes("es") ? "es" : "en";
}

/** Food's client surface defaults English (Slice 1) — no stored locale preference exists for a buyer either. */
const CLIENT_EMAIL_LOCALE: EmailLocale = "en";

interface NotifyOrder {
  id: string;
  orderNumber: string;
  clientId: string;
  clientEmail: string | null;
}
interface NotifySeller {
  userId: string;
  email: string | null;
  languages: string[];
  displayName: string;
}

export async function notifyOrderPlaced(order: NotifyOrder, seller: NotifySeller, listingTitle: string): Promise<void> {
  await notifyUser(seller.userId, "ORDER_PLACED", { orderId: order.id, orderNumber: order.orderNumber });
  if (!seller.email) return;
  try {
    await sendOrderPlacedEmail(seller.email, sellerEmailLocale(seller), {
      orderId: order.id,
      orderNumber: order.orderNumber,
      listingTitle,
    });
  } catch (err) {
    console.error("[notifications] order-placed email failed", err);
  }
}

export async function notifyOrderAccepted(
  order: NotifyOrder & { fulfillmentAt: Date },
  seller: Pick<NotifySeller, "displayName">,
): Promise<void> {
  await notifyUser(order.clientId, "ORDER_ACCEPTED", { orderId: order.id, orderNumber: order.orderNumber });
  if (!order.clientEmail) return;
  try {
    await sendOrderAcceptedEmail(order.clientEmail, CLIENT_EMAIL_LOCALE, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerName: seller.displayName,
      fulfillmentAt: order.fulfillmentAt,
    });
  } catch (err) {
    console.error("[notifications] order-accepted email failed", err);
  }
}

export async function notifyOrderDeclined(
  order: NotifyOrder & { declineReason: string | null },
  seller: Pick<NotifySeller, "displayName">,
): Promise<void> {
  await notifyUser(order.clientId, "ORDER_DECLINED", { orderId: order.id, orderNumber: order.orderNumber });
  if (!order.clientEmail) return;
  try {
    await sendOrderDeclinedEmail(order.clientEmail, CLIENT_EMAIL_LOCALE, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerName: seller.displayName,
      reason: order.declineReason,
    });
  } catch (err) {
    console.error("[notifications] order-declined email failed", err);
  }
}

/** Called from the sweep (`lib/sweep.ts`'s `sweepExpiredOrders`) — no live session, email is the only channel that reaches the customer. */
export async function notifyOrderExpired(order: NotifyOrder, seller: Pick<NotifySeller, "displayName">): Promise<void> {
  await notifyUser(order.clientId, "ORDER_EXPIRED", { orderId: order.id, orderNumber: order.orderNumber });
  if (!order.clientEmail) return;
  try {
    await sendOrderExpiredEmail(order.clientEmail, CLIENT_EMAIL_LOCALE, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerName: seller.displayName,
    });
  } catch (err) {
    console.error("[notifications] order-expired email failed", err);
  }
}

/** At most one "new messages" email per order per recipient per this window (Part E6: "≤1 per order per ~15 min"). */
const MESSAGE_EMAIL_DEBOUNCE_MS = 15 * 60 * 1000;

/**
 * Pure decision, exported so a verification script can prove the debounce
 * window directly — no database, no clock-dependent test flakiness — mirroring
 * this codebase's own "extract the decision, test it directly" discipline
 * (`lib/order-status.ts`'s `decideOrderTransition`).
 */
export function shouldSendDebouncedEmail(lastEmailedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastEmailedAt) return true;
  return now.getTime() - lastEmailedAt.getTime() >= MESSAGE_EMAIL_DEBOUNCE_MS;
}

/**
 * Fires on every message send, to the party that DIDN'T send it. The in-app
 * row is written every time (so the unread badge and `/orders`'s own list
 * stay accurate); the EMAIL is throttled by `shouldSendDebouncedEmail` against
 * the recipient's own most recently EMAILED `ORDER_MESSAGE` row for this
 * order — a burst of messages inside the window writes several unread rows
 * but sends at most one email, and the very next message after the window
 * closes fires a fresh one.
 */
export async function notifyOrderMessage(
  order: NotifyOrder & { sellerId: string },
  seller: NotifySeller,
  senderRole: "seller" | "client",
): Promise<void> {
  const recipientUserId = senderRole === "seller" ? order.clientId : seller.userId;
  const recipientEmail = senderRole === "seller" ? order.clientEmail : seller.email;
  const recipientLocale = senderRole === "seller" ? CLIENT_EMAIL_LOCALE : sellerEmailLocale(seller);
  // The buyer has no local display name to show the SELLER (no cross-DB
  // relation) — their snapshotted email doubles as the label, same fallback
  // shape Salon's own `notifyRequestReceived` uses (`request.clientEmail ??
  // "a client"`) for the identical gap.
  const counterpartLabel = senderRole === "seller" ? seller.displayName : order.clientEmail;

  const payload = { orderId: order.id, orderNumber: order.orderNumber };
  let created: { id: string } | null;
  try {
    created = await prisma.foodNotification.create({ data: { userId: recipientUserId, kind: "ORDER_MESSAGE", payload } });
  } catch (err) {
    console.error("[notifications] failed to write ORDER_MESSAGE", err);
    created = null;
  }
  if (!created || !recipientEmail) return;

  const lastEmailed = await prisma.foodNotification.findFirst({
    where: {
      userId: recipientUserId,
      kind: "ORDER_MESSAGE",
      payload: { path: ["orderId"], equals: order.id },
      emailedAt: { not: null },
    },
    orderBy: { emailedAt: "desc" },
    select: { emailedAt: true },
  });
  if (!shouldSendDebouncedEmail(lastEmailed?.emailedAt ?? null)) return;

  try {
    await sendNewMessagesEmail(recipientEmail, recipientLocale, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      counterpartLabel,
      audience: senderRole === "seller" ? "CLIENT" : "SELLER",
    });
    await prisma.foodNotification.update({ where: { id: created.id }, data: { emailedAt: new Date() } });
  } catch (err) {
    console.error("[notifications] new-messages email failed", err);
  }
}
