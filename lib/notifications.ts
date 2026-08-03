import type { NotificationKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
