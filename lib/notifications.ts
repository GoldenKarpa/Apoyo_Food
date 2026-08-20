import type { NotificationKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  sendOrderPlacedEmail,
  sendOrderAcceptedEmail,
  sendOrderDeclinedEmail,
  sendOrderExpiredEmail,
  sendNewMessagesEmail,
  sendNewThreadMessagesEmail,
  type EmailLocale,
} from "@/lib/email";
import { deliveryFor, wantsEmail, wantsInApp } from "@/lib/notification-prefs";

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
  // PC-1 — a message on a persistent thread counts toward the same badge. It
  // is the same event to a seller ("someone wrote to me"); only its route back
  // differs.
  "THREAD_MESSAGE",
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
 * ⚠ `notifyOrderMessage` lived here until PC-1 and is GONE, not deprecated —
 * `notifyThreadMessage` below replaces it for both message kinds. The
 * difference is not cosmetic: the old function debounced email against the
 * recipient's last emailed row **for one ORDER**, which on a persistent thread
 * would have restarted the 15-minute window every time the conversation moved
 * between orders (and never applied at all to a message belonging to none).
 * Debouncing per THREAD is what actually delivers the user's standing rule
 * that chat must never generate per-message email.
 */

// ── PC-1 · persistent-thread messages ────────────────────────────────────────

/**
 * Fires on every message send, to the party that DIDN'T send it — the thread
 * equivalent of `notifyOrderMessage`, and the path a post-order message takes.
 *
 * Three things differ from the order variant, all of them user rulings from
 * 2026-08-19:
 *
 *  1. **The seller's own delivery preference is honoured** (`chat` category):
 *     `IN_APP_AND_EMAIL` (default), `IN_APP`, or `OFF`. ⚠ It applies ONLY when
 *     the seller is the RECIPIENT. A buyer has no settings surface in this app,
 *     so a seller's preference must never suppress the buyer's own
 *     notification — that would let one party silence the other.
 *  2. **Email is debounced per THREAD, not per order** — at most one per
 *     conversation per 15 minutes, reusing `shouldSendDebouncedEmail`
 *     unchanged. The user was explicit that per-message chat email is not
 *     wanted at any point, and a persistent thread makes long back-and-forths
 *     the normal case rather than the exception.
 *  3. **`orderId` is optional.** When present the row is an `ORDER_MESSAGE`
 *     (so the order page's own `markOrderNotificationsRead` still clears it,
 *     unchanged); when absent it is a `THREAD_MESSAGE`. Both carry `threadId`,
 *     which is what lets the Messages section clear either kind.
 *
 * Best-effort throughout, like every other notifier here: a failed write or a
 * failed send must never fail the message that triggered it.
 */
export async function notifyThreadMessage(
  thread: { id: string; clientId: string; clientEmail: string | null },
  seller: NotifySeller & { notificationPrefs: unknown },
  senderRole: "seller" | "client",
  order?: { id: string; orderNumber: string } | null,
): Promise<void> {
  const recipientIsSeller = senderRole === "client";
  const recipientUserId = recipientIsSeller ? seller.userId : thread.clientId;
  const recipientEmail = recipientIsSeller ? seller.email : thread.clientEmail;
  const recipientLocale = recipientIsSeller ? sellerEmailLocale(seller) : CLIENT_EMAIL_LOCALE;
  // The buyer has no local display name to show the SELLER (no cross-DB
  // relation) — their snapshotted email doubles as the label, the same
  // fallback `notifyOrderMessage` uses for the identical gap.
  const counterpartLabel = recipientIsSeller ? thread.clientEmail : seller.displayName;

  // ⚠ Only consulted for a seller recipient — see point 1 above.
  const delivery = recipientIsSeller ? deliveryFor(seller.notificationPrefs, "chat") : "IN_APP_AND_EMAIL";

  // OFF suppresses the in-app row too, not merely the email: a seller who
  // asked not to be notified should not accrue an unread badge either. The
  // MESSAGE is still written and still shown in the thread — this governs
  // being chased about it, never whether it is delivered.
  if (!wantsInApp(delivery)) return;

  const kind: NotificationKind = order ? "ORDER_MESSAGE" : "THREAD_MESSAGE";
  const payload: Record<string, unknown> = order
    ? { orderId: order.id, orderNumber: order.orderNumber, threadId: thread.id }
    : { threadId: thread.id };

  let created: { id: string } | null;
  try {
    created = await prisma.foodNotification.create({
      data: { userId: recipientUserId, kind, payload: payload as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error("[notifications] failed to write", kind, (err as Error).message);
    created = null;
  }
  if (!created || !recipientEmail || !wantsEmail(delivery)) return;

  // Debounced against this THREAD's own last emailed notification, across both
  // kinds — an order-scoped message and a post-order one an hour apart are the
  // same conversation to the recipient, and switching kinds must not reset the
  // window.
  const lastEmailed = await prisma.foodNotification.findFirst({
    where: {
      userId: recipientUserId,
      kind: { in: ["ORDER_MESSAGE", "THREAD_MESSAGE"] },
      payload: { path: ["threadId"], equals: thread.id },
      emailedAt: { not: null },
    },
    orderBy: { emailedAt: "desc" },
    select: { emailedAt: true },
  });
  if (!shouldSendDebouncedEmail(lastEmailed?.emailedAt ?? null)) return;

  try {
    if (order) {
      await sendNewMessagesEmail(recipientEmail, recipientLocale, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        counterpartLabel,
        audience: recipientIsSeller ? "SELLER" : "CLIENT",
      });
    } else {
      await sendNewThreadMessagesEmail(recipientEmail, recipientLocale, {
        threadId: thread.id,
        counterpartLabel,
        audience: recipientIsSeller ? "SELLER" : "CLIENT",
      });
    }
    await prisma.foodNotification.update({ where: { id: created.id }, data: { emailedAt: new Date() } });
  } catch (err) {
    console.error("[notifications] new-messages email failed", err);
  }
}

/**
 * Clears a viewer's message notifications for ONE conversation — the thread
 * page's equivalent of `markOrderNotificationsRead`.
 *
 * Covers BOTH kinds by `threadId`, which is why the PC-1 migration backfills
 * `threadId` into pre-existing `ORDER_MESSAGE` payloads: without that, an old
 * unread notification could only ever be cleared by opening the order page it
 * named, never from the Messages section.
 */
export async function markThreadNotificationsRead(userId: string, threadId: string): Promise<void> {
  await prisma.foodNotification.updateMany({
    where: {
      userId,
      readAt: null,
      kind: { in: ["ORDER_MESSAGE", "THREAD_MESSAGE"] },
      payload: { path: ["threadId"], equals: threadId },
    },
    data: { readAt: new Date() },
  });
}
