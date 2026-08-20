import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { formatMessageInstant } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface ThreadListRow {
  id: string;
  lastMessageAt: Date | null;
  unreadCount: number;
  /** Who the viewer is talking to. The buyer has no local display name (no cross-DB relation). */
  counterpartLabel: string | null;
  messages: { id: string; senderUserId: string; originalText: string; attachmentKind: string | null }[];
}

/**
 * PC-1 — one conversation list, rendered by both surfaces.
 *
 * ⚠ The preview text is `originalText`, deliberately NOT the viewer's
 * translation. `resolveTranslatedText` is free to call (Part E6 stores
 * translations at send time and never recomputes), but a list of one-line
 * previews is the one place the ORIGINAL is more useful: it is what the other
 * person actually typed, and a preview is a jog to memory rather than
 * something to read carefully. The thread itself shows both.
 */
/**
 * ⚠ **Isomorphic on purpose (PD-S10) — no `"use client"`, no `async`.**
 *
 * next-intl v4 resolves `useTranslations()` on either side of the RSC boundary
 * (already this repo's own pattern in `components/ui/*`), so this file server-
 * renders on the four real conversation surfaces exactly as it did before AND
 * renders client-side inside `/food/demo`, where the whole transcript lives in
 * React state and must re-render on every fixture send. An `async` component
 * cannot do the second thing at all. Do not reintroduce `await
 * getTranslations()` here — that is the one line that would silently take the
 * demo's conversation section out of the product.
 */
export function ThreadList({
  threads,
  hrefBase,
  emptyMessage,
}: {
  threads: ThreadListRow[];
  /** `/food/messages` or `/messages` — the only difference between the two surfaces. */
  hrefBase: string;
  emptyMessage: string;
}) {
  const t = useTranslations("threads");
  const locale = useLocale();

  if (threads.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-hairline bg-sunken p-6 text-center text-label text-ink">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {threads.map((thread) => {
        const last = thread.messages[0];
        const preview = last?.originalText || (last?.attachmentKind ? t("photoPreview") : "");
        return (
          <li key={thread.id}>
            <Link
              href={`${hrefBase}/${thread.id}`}
              className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-4 transition-colors duration-200 ease-soft hover:bg-sunken"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-label font-semibold text-ink">
                  {thread.counterpartLabel ?? t("unknownCounterpart")}
                </span>
                {thread.unreadCount > 0 && (
                  <span className="rounded-pill bg-green-vivid px-2 py-0.5 text-caption font-semibold text-ink">
                    {t("unreadCount", { count: thread.unreadCount })}
                  </span>
                )}
              </div>
              {preview && (
                <p className={cn("line-clamp-2 text-body", thread.unreadCount > 0 ? "text-ink" : "text-ink-muted")}>
                  {preview}
                </p>
              )}
              {thread.lastMessageAt && (
                <span className="text-caption text-ink-muted">
                  {/* Pinned — same reasoning as `<OrderThread>`'s. */}
                  {formatMessageInstant(thread.lastMessageAt, locale)}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
