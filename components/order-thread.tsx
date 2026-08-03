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
  createdAt: Date;
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
}: {
  messages: OrderThreadMessage[];
  viewerUserId: string;
  viewerLocale: Locale;
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
                  <FoodImage src={message.attachmentPath} alt="" aspect="thumb" sizes="160px" />
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
            </span>
          </li>
        );
      })}
    </ul>
  );
}
