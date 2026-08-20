"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import { parseDelivery, withDelivery } from "@/lib/notification-prefs";

/**
 * PC-1 — the seller's own controls over conversation.
 *
 * ⚠ **Ownership comes from the session, never from the form.** Same rule as
 * `lib/actions/update-seller-profile.ts`: `requireOwnSeller()` resolves the row
 * by `userId` from the decoded JWT, so there is no seller-id parameter anywhere
 * in this file and "change someone else's settings" is not a request that can
 * be expressed.
 *
 * ⚠ **These settings never touch message DELIVERY.** Turning post-order
 * conversation off stops new messages being accepted; turning notifications off
 * stops the seller being chased about them. Neither hides an existing thread,
 * deletes anything, or blocks messages about a live order — the ruling is
 * explicit that history stays visible and open orders stay writable.
 */

export type SettingsResult = { ok: true } | { ok: false; reason: "unauthorized" | "invalid" };

/**
 * The post-order escape hatch. Defaults to ON at the schema level, so a seller
 * who never visits this page is reachable — that is the ruling, not a default
 * chosen for convenience.
 */
export async function setPostOrderMessaging(enabled: boolean): Promise<SettingsResult> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { ok: false, reason: "unauthorized" };

  await prisma.foodSeller.update({ where: { id: ctx.seller.id }, data: { postOrderMessaging: enabled } });
  revalidatePath("/food/profile");
  revalidatePath("/food/messages");
  return { ok: true };
}

/**
 * Whether the buyer is shown "Read" on their own messages.
 *
 * ⚠ Disclosure only — `FoodMessage.readAt` keeps being written either way. The
 * seller's own unread counts read that same column, so making this suppress the
 * write would silently break their inbox as a side effect of a privacy toggle.
 */
export async function setMessageReadReceipts(enabled: boolean): Promise<SettingsResult> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { ok: false, reason: "unauthorized" };

  await prisma.foodSeller.update({ where: { id: ctx.seller.id }, data: { messageReadReceipts: enabled } });
  revalidatePath("/food/profile");
  return { ok: true };
}

/**
 * How the seller is told about new messages: `IN_APP_AND_EMAIL` (default),
 * `IN_APP`, or `OFF`.
 *
 * ⚠ Scoped to the `chat` category ONLY. Order-lifecycle mail is deliberately
 * not expressible here — a seller who silences "you have a new order" has a
 * broken business rather than a quieter one. `withDelivery` merges rather than
 * replaces, so a category added later isn't wiped by a save from this form.
 */
export async function setChatNotificationDelivery(value: string): Promise<SettingsResult> {
  const delivery = parseDelivery(value);
  if (!delivery) return { ok: false, reason: "invalid" };

  const ctx = await requireOwnSeller();
  if (!ctx) return { ok: false, reason: "unauthorized" };

  await prisma.foodSeller.update({
    where: { id: ctx.seller.id },
    data: { notificationPrefs: withDelivery(ctx.seller.notificationPrefs, "chat", delivery) },
  });
  revalidatePath("/food/profile");
  return { ok: true };
}
