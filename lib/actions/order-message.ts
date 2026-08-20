"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { AttachmentKind, ReportReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { requireOwnOrderAsSeller, requireOwnOrderAsClient } from "@/lib/order";
import {
  requireOwnThreadAsSeller,
  requireOwnThreadAsClient,
  resolveThread,
  resolveThreadAccess,
} from "@/lib/thread";
import { prepareTranslatedText } from "@/lib/bilingual";
import { notifyThreadMessage } from "@/lib/notifications";
import { safeStorageKey } from "@/lib/storage";
import { MAX_MESSAGE_LENGTH } from "@/lib/order-message-form";
import type { Locale } from "@/i18n/request";

/**
 * The conversation's writes (Slice 18 for the order thread, PC-1 for the
 * persistent one). One action shared by BOTH surfaces — `actor` says which
 * ownership guard applies, mirroring `lib/actions/order.ts`'s `cancelOrder`
 * shape for the same reason: the logic is identical either direction, only the
 * resolved identity differs.
 *
 * ⚠ **Two entry points, one writer, one gate.** `sendOrderMessage` (from an
 * order's detail page) and `sendThreadMessage` (from the Messages section)
 * both resolve to the same `(seller, buyer)` thread and both run
 * `resolveThreadAccess` before writing. The gate is re-derived from live order
 * state on every send rather than trusted from the caller — a stale page, a
 * replayed request, or a seller who opted out thirty seconds ago must all be
 * caught HERE, not by whether the client bothered to render a composer.
 */

function isMessageAttachmentKey(key: string): boolean {
  const safe = safeStorageKey(key);
  return !!safe && safe.split(/[\\/]/)[0] === "orders";
}

export type SendMessageResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "tooLong" | "invalidAttachment" | "unauthorized" | "blocked" };

const schema = z.object({
  text: z.string().trim(),
  attachmentPath: z.string().trim(),
});

interface ParsedMessage {
  text: string;
  attachmentPath: string;
  attachmentKind: AttachmentKind | null;
}

function parseMessage(formData: FormData): ParsedMessage | { error: SendMessageResult } {
  const parsed = schema.safeParse({
    text: formData.get("text") ?? "",
    attachmentPath: formData.get("attachmentPath") ?? "",
  });
  if (!parsed.success) return { error: { ok: false, reason: "empty" } };
  const { text, attachmentPath } = parsed.data;

  if (!text && !attachmentPath) return { error: { ok: false, reason: "empty" } };
  if (text.length > MAX_MESSAGE_LENGTH) return { error: { ok: false, reason: "tooLong" } };

  let attachmentKind: AttachmentKind | null = null;
  if (attachmentPath) {
    if (!isMessageAttachmentKey(attachmentPath)) return { error: { ok: false, reason: "invalidAttachment" } };
    attachmentKind = "PHOTO";
  }
  return { text, attachmentPath, attachmentKind };
}

/**
 * The single writer. Everything above it resolves *who* and *where*; this
 * translates, stores, notifies and revalidates.
 *
 * ⚠ The photo, if any, is uploaded BEFORE this runs (through the generic media
 * route, `kind: "message"`, `mediaUploadUrl(actor)` per ecosystem ruling E14
 * since this composer runs on both surfaces) — the same "ingest first, attach
 * second" shape Slice 15 established for Fresh Today, for the identical
 * reason: the message doesn't exist yet to attach a photo TO.
 * `attachmentPath` is re-validated in `parseMessage` as the trust boundary — a
 * tampered request naming a key from a different category (`sellers/...`,
 * `listings/...`) is rejected, never written into a thread either party can
 * read.
 */
async function writeMessage(args: {
  threadId: string;
  order: { id: string; orderNumber: string } | null;
  senderUserId: string;
  actor: "seller" | "client";
  message: ParsedMessage;
}): Promise<SendMessageResult> {
  const { threadId, order, senderUserId, actor, message } = args;

  const thread = await prisma.foodThread.findUniqueOrThrow({
    where: { id: threadId },
    select: {
      id: true,
      clientId: true,
      clientEmail: true,
      seller: {
        select: { userId: true, email: true, languages: true, displayName: true, notificationPrefs: true },
      },
    },
  });

  // Surface-default locale (the same simplification `lib/notifications.ts`'s
  // email fan-out uses for the identical reason: no persisted per-user locale
  // preference exists anywhere in this app). `getLocale()` resolves through
  // `i18n/request.ts`'s own x-food-surface/NEXT_LOCALE chain, so a genuine
  // cookie override on the SENDER'S side is still honoured — this only
  // defaults, never overrides.
  const authorLocale = (await getLocale()) as Locale;
  const translated = await prepareTranslatedText(message.text, authorLocale);

  const now = new Date();
  // One transaction: a message that lands without moving `lastMessageAt` sorts
  // to the bottom of both parties' Messages lists and reads to the retention
  // sweep as older than it is.
  await prisma.$transaction([
    prisma.foodMessage.create({
      data: {
        threadId,
        orderId: order?.id ?? null,
        senderUserId,
        originalText: translated.originalText,
        originalLocale: translated.originalLocale,
        translations: translated.translations,
        attachmentPath: message.attachmentPath || null,
        attachmentKind: message.attachmentKind,
      },
    }),
    prisma.foodThread.update({ where: { id: threadId }, data: { lastMessageAt: now } }),
  ]);

  await notifyThreadMessage(thread, thread.seller, actor, order);

  if (order) {
    revalidatePath(`/food/orders/${order.id}`);
    revalidatePath(`/orders/${order.id}`);
  }
  revalidatePath(`/food/messages/${threadId}`);
  revalidatePath(`/messages/${threadId}`);
  return { ok: true };
}

/**
 * Send from an order's own detail page — today's composer, unchanged in shape.
 *
 * ⚠ It still runs the gate. An order page is reachable forever (order history
 * is permanent), so once every order between the pair has closed AND the seller
 * has opted out, the composer on an old order must stop working too — otherwise
 * "keep chat bound to open orders" would have a permanent hole in it, one click
 * away in the buyer's order list.
 */
export async function sendOrderMessage(
  orderId: string,
  actor: "seller" | "client",
  formData: FormData,
): Promise<SendMessageResult> {
  const parsed = parseMessage(formData);
  if ("error" in parsed) return parsed.error;

  let senderUserId: string;
  if (actor === "seller") {
    const ctx = await requireOwnOrderAsSeller(orderId);
    if (!ctx) return { ok: false, reason: "unauthorized" };
    senderUserId = ctx.session.userId;
  } else {
    const ctx = await requireOwnOrderAsClient(orderId);
    if (!ctx) return { ok: false, reason: "unauthorized" };
    senderUserId = ctx.session.userId;
  }

  const order = await prisma.foodOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, orderNumber: true, clientId: true, clientEmail: true, sellerId: true },
  });

  const access = await resolveThreadAccess(order.sellerId, order.clientId);
  if (!access.canWrite) return { ok: false, reason: "blocked" };

  const thread = await resolveThread(order.sellerId, order.clientId, order.clientEmail);
  return writeMessage({ threadId: thread.id, order, senderUserId, actor, message: parsed });
}

/**
 * Send from the Messages section — the persistent path, with no order in
 * context even when one exists.
 */
export async function sendThreadMessage(
  threadId: string,
  actor: "seller" | "client",
  formData: FormData,
): Promise<SendMessageResult> {
  const parsed = parseMessage(formData);
  if ("error" in parsed) return parsed.error;

  const ctx = actor === "seller" ? await requireOwnThreadAsSeller(threadId) : await requireOwnThreadAsClient(threadId);
  if (!ctx) return { ok: false, reason: "unauthorized" };

  const access = await resolveThreadAccess(ctx.sellerId, ctx.clientId);
  if (!access.canWrite) return { ok: false, reason: "blocked" };

  return writeMessage({ threadId, order: null, senderUserId: ctx.session.userId, actor, message: parsed });
}

// ── Reporting hook (Slice 18 bullet: "report content -> the Slice 16 admin flag list") ──

export type ReportMessageResult = { ok: true } | { ok: false; reason: "unauthorized" | "invalid" | "noMessage" };

const VALID_REASONS = new Set<string>(["INAPPROPRIATE", "SUSPECTED_SCAM", "FOOD_SAFETY_CONCERN", "OTHER"]);

/**
 * ⚠ Deliberately NOT a schema extension. `FoodReport` already carries a free-
 * text `message` column (Slice 16); the order number, where there is one, plus
 * the reported text are folded into it rather than adding
 * `orderId`/`messageId` columns for a single caller. Unlike `reportListing`'s
 * anonymous-flood mitigation (dedup, no identity to check), a message report
 * REQUIRES the reporter to be a real participant in this specific
 * conversation — the thread isn't visible to anyone else, so the
 * anonymous-flood vector doesn't apply here at all.
 *
 * ⚠ PC-1 moved participation off the ORDER and onto the THREAD, which is what
 * makes a post-order message reportable at all: `message.order` is now
 * nullable, so a check that read `message.order.clientId` would have thrown on
 * exactly the messages this feature adds.
 */
export async function reportMessage(
  messageId: string,
  reasonInput: string,
  details: string,
): Promise<ReportMessageResult> {
  if (!VALID_REASONS.has(reasonInput)) return { ok: false, reason: "invalid" };

  const message = await prisma.foodMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      originalText: true,
      order: { select: { orderNumber: true } },
      thread: { select: { sellerId: true, clientId: true } },
    },
  });
  if (!message) return { ok: false, reason: "noMessage" };

  const session = await getFoodSession();
  if (!session) return { ok: false, reason: "unauthorized" };

  const ownSeller = await prisma.foodSeller.findUnique({ where: { userId: session.userId }, select: { id: true } });
  const isParticipant = session.userId === message.thread.clientId || ownSeller?.id === message.thread.sellerId;
  if (!isParticipant) return { ok: false, reason: "unauthorized" };

  const detail = details.trim().slice(0, 1000);
  const composed = [
    message.order ? `[Order ${message.order.orderNumber}]` : "[Conversation, no order]",
    detail,
    `Reported message: "${message.originalText.slice(0, 500)}"`,
  ]
    .filter(Boolean)
    .join("\n\n");

  await prisma.foodReport.create({
    data: {
      sellerId: message.thread.sellerId,
      reporterUserId: session.userId,
      reason: reasonInput as ReportReason,
      message: composed,
    },
  });

  return { ok: true };
}
