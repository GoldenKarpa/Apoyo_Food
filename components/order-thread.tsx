import { getTranslations } from "next-intl/server";

import { FoodImage } from "@/components/food-image";
import { ReportMessageSheet } from "@/components/report-message-sheet";
import { resolveTranslatedText } from "@/lib/bilingual";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/request";

export interface OrderThreadMessage {
  id: string;
  senderUserId: string;
  originalText: string;
  originalLocale: string | null;
  translations: unknown;
  attachmentPath: string | null;
  attachmentKind: string | null;
  readAt: Date | null;
  createdAt: Date;
  /** PC-1 — present only on the Messages section, where a thread spans orders. */
  order?: { id: string; orderNumber: string } | null;
}

/**
 * The order thread (Slice 18, architecture E6/F3): "original text prominent,
 * smaller/lighter translation beneath, sender-aligned, cream/green tints".
 *
 * Server Component — `resolveTranslatedText` makes zero network calls (Part
 * E6: translations are computed once at SEND time and never recomputed on
 * read), so rendering the whole thread costs nothing beyond the query that
 * already happened. Only the per-message report trigger is a client island.
 */
export async function OrderThread({
  messages,
  viewerUserId,
  viewerLocale,
  surface,
  showReadReceipts = true,
  showOrderContext = false,
}: {
  messages: OrderThreadMessage[];
  viewerUserId: string;
  viewerLocale: Locale;
  /** Which surface is rendering this thread — picks the reachable attachment read path (E14). */
  surface: "buyer" | "seller";
  /**
   * PC-1 — whether "Read" is shown beneath the viewer's OWN messages.
   *
   * ⚠ Only ever `false` on the BUYER's surface, and only because the seller
   * turned `messageReadReceipts` off. `FoodMessage.readAt` is written either
   * way (the seller's unread counts read the same column) — this hides the
   * value, it does not stop its capture, and the caller is responsible for
   * passing the seller's setting through. A seller always sees whether the
   * buyer read them; the buyer has no equivalent setting because this app
   * gives a buyer no settings surface at all.
   */
  showReadReceipts?: boolean;
  /** Label which order a message was about — only meaningful where a thread spans several. */
  showOrderContext?: boolean;
}) {
  const t = await getTranslations("orderThread");

  if (messages.length === 0) {
    return <p className="rounded-card border border-dashed border-hairline bg-sunken p-6 text-center text-label text-ink-muted">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {messages.map((message) => {
        const own = message.senderUserId === viewerUserId;
        const resolved = resolveTranslatedText(message, viewerLocale);
        return (
          <li key={message.id} className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}>
            <div
              className={cn(
                "group relative max-w-[85%] rounded-card px-4 py-3 shadow-soft",
                own ? "bg-green-soft text-ink" : "bg-card text-ink",
              )}
            >
              {message.attachmentPath && (
                <div className="mb-2 w-40">
                  <FoodImage src={message.attachmentPath} alt="" aspect="thumb" sizes="160px" surface={surface} />
                </div>
              )}
              {resolved && (
                <>
                  <p className="whitespace-pre-line text-body">{resolved.text}</p>
                  {resolved.isTranslated && (
                    <p className="mt-1 whitespace-pre-line text-caption text-ink-muted">{resolved.original}</p>
                  )}
                </>
              )}
              <ReportMessageSheet messageId={message.id} />
            </div>
            <span className="px-1 text-caption text-ink-muted">
              {new Intl.DateTimeFormat(viewerLocale, { dateStyle: "short", timeStyle: "short" }).format(message.createdAt)}
              {showOrderContext && message.order && ` · ${message.order.orderNumber}`}
              {own && showReadReceipts && message.readAt && ` · ${t("read")}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
