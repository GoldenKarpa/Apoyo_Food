"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { AttachmentKind, ReportReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { requireOwnOrderAsSeller, requireOwnOrderAsClient } from "@/lib/order";
import { prepareTranslatedText } from "@/lib/bilingual";
import { notifyOrderMessage } from "@/lib/notifications";
import { safeStorageKey } from "@/lib/storage";
import { MAX_MESSAGE_LENGTH } from "@/lib/order-message-form";
import type { Locale } from "@/i18n/request";

/**
 * The order thread's writes (Slice 18, architecture E6). One action shared by
 * BOTH surfaces — `actor` says which ownership guard applies, mirroring
 * `lib/actions/order.ts`'s `cancelOrder` shape for the same reason: the logic
 * is identical either direction, only the resolved identity differs.
 */

function isMessageAttachmentKey(key: string): boolean {
  const safe = safeStorageKey(key);
  return !!safe && safe.split(/[\\/]/)[0] === "orders";
}

export type SendMessageResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "tooLong" | "invalidAttachment" | "unauthorized" };

const schema = z.object({
  text: z.string().trim(),
  attachmentPath: z.string().trim(),
});

/**
 * ⚠ The photo, if any, is uploaded BEFORE this action runs (through the
 * generic media route, `kind: "message"`, `mediaUploadUrl(actor)` per
 * ecosystem ruling E14 since this composer runs on both surfaces) — the same
 * "ingest first, attach second" shape Slice 15 established for Fresh Today, for the identical
 * reason: the message doesn't exist yet to attach a photo TO. `attachmentPath`
 * is re-validated here as the trust boundary — a tampered request naming a
 * key from a different category (`sellers/...`, `listings/...`) is rejected,
 * never written into a thread either party can read.
 */
export async function sendOrderMessage(
  orderId: string,
  actor: "seller" | "client",
  formData: FormData,
): Promise<SendMessageResult> {
  const parsed = schema.safeParse({
    text: formData.get("text") ?? "",
    attachmentPath: formData.get("attachmentPath") ?? "",
  });
  if (!parsed.success) return { ok: false, reason: "empty" };
  const { text, attachmentPath } = parsed.data;

  if (!text && !attachmentPath) return { ok: false, reason: "empty" };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: "tooLong" };

  let attachmentKind: AttachmentKind | null = null;
  if (attachmentPath) {
    if (!isMessageAttachmentKey(attachmentPath)) return { ok: false, reason: "invalidAttachment" };
    attachmentKind = "PHOTO";
  }

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
    select: {
      id: true,
      orderNumber: true,
      clientId: true,
      clientEmail: true,
      sellerId: true,
      seller: { select: { userId: true, email: true, languages: true, displayName: true } },
    },
  });

  // Surface-default locale (the same simplification `lib/notifications.ts`'s
  // email fan-out uses for the identical reason: no persisted per-user locale
  // preference exists anywhere in this app). `getLocale()` resolves through
  // `i18n/request.ts`'s own x-food-surface/NEXT_LOCALE chain, so a genuine
  // cookie override on the SENDER'S side is still honoured — this only
  // defaults, never overrides.
  const authorLocale = (await getLocale()) as Locale;
  const translated = await prepareTranslatedText(text, authorLocale);

  await prisma.foodOrderMessage.create({
    data: {
      orderId,
      senderUserId,
      originalText: translated.originalText,
      originalLocale: translated.originalLocale,
      translations: translated.translations,
      attachmentPath: attachmentPath || null,
      attachmentKind,
    },
  });

  await notifyOrderMessage(order, order.seller, actor);

  revalidatePath(`/food/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// ── Reporting hook (Slice 18 bullet: "report content -> the Slice 16 admin flag list") ──

export type ReportMessageResult = { ok: true } | { ok: false; reason: "unauthorized" | "invalid" | "noMessage" };

const VALID_REASONS = new Set<string>(["INAPPROPRIATE", "SUSPECTED_SCAM", "FOOD_SAFETY_CONCERN", "OTHER"]);

/**
 * ⚠ Deliberately NOT a schema extension. `FoodReport` already carries a free-
 * text `message` column (Slice 16); the order number + the reported text are
 * folded into it rather than adding `orderId`/`messageId` columns for a single
 * caller. Unlike `reportListing`'s anonymous-flood mitigation (dedup, no
 * identity to check), a message report REQUIRES the reporter to be a real
 * participant in this specific order — the thread isn't visible to anyone
 * else, so the anonymous-flood vector doesn't apply here at all.
 */
export async function reportOrderMessage(
  messageId: string,
  reasonInput: string,
  details: string,
): Promise<ReportMessageResult> {
  if (!VALID_REASONS.has(reasonInput)) return { ok: false, reason: "invalid" };

  const message = await prisma.foodOrderMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      originalText: true,
      order: { select: { orderNumber: true, sellerId: true, clientId: true } },
    },
  });
  if (!message) return { ok: false, reason: "noMessage" };

  const session = await getFoodSession();
  if (!session) return { ok: false, reason: "unauthorized" };

  const ownSeller = await prisma.foodSeller.findUnique({ where: { userId: session.userId }, select: { id: true } });
  const isParticipant = session.userId === message.order.clientId || ownSeller?.id === message.order.sellerId;
  if (!isParticipant) return { ok: false, reason: "unauthorized" };

  const detail = details.trim().slice(0, 1000);
  const composed = [
    `[Order ${message.order.orderNumber}]`,
    detail,
    `Reported message: "${message.originalText.slice(0, 500)}"`,
  ]
    .filter(Boolean)
    .join("\n\n");

  await prisma.foodReport.create({
    data: {
      sellerId: message.order.sellerId,
      reporterUserId: session.userId,
      reason: reasonInput as ReportReason,
      message: composed,
    },
  });

  return { ok: true };
}
