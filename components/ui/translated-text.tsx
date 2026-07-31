"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bilingual free text — architecture Part F3's order-thread rule: **the original
 * is prominent, the translation sits smaller and lighter beneath it.**
 *
 * Graduated from `components/scaffold/translation-proof-client.tsx` rather than
 * rewritten: the Slice 5 mechanism was never the scaffolding — the surrounding
 * proof page was — so the behaviour is unchanged and only the labels moved from
 * threaded props into the catalogue. Slice 18 renders real `FoodOrderMessage`
 * rows through this component.
 *
 * Toggling never re-fetches anything. Both strings were resolved server-side
 * from the stored triple (`originalText` / `originalLocale` / `translations`)
 * by `lib/bilingual.ts`'s `resolveTranslatedText`, which makes zero network
 * calls by design — translation is computed once at send time, never on read.
 *
 * When `isTranslated` is false the component renders the text and nothing else:
 * no label, no toggle. A reader seeing the author's own language must not be
 * told anything was translated, and the translate service echoing input back
 * (`skipped: true`) is deliberately not stored as a translation for the same
 * reason — a thread must never show the same sentence twice.
 */
export interface TranslatedTextProps {
  /** What to show first — the translation when there is one, else the original. */
  text: string;
  /** The author's own words. */
  original: string;
  /** False when the viewer already reads the author's language. */
  isTranslated: boolean;
  /** Shown when the translate service was unreachable at send time. */
  degraded?: boolean;
  className?: string;
}

export function TranslatedText({
  text,
  original,
  isTranslated,
  degraded = false,
  className,
}: TranslatedTextProps) {
  const t = useTranslations("translation");
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-body text-ink">{showOriginal ? original : text}</p>

      {degraded && <p className="text-caption text-ink-muted">{t("serviceDown")}</p>}

      {isTranslated && (
        <>
          {!showOriginal && <p className="text-caption text-ink-muted">{t("autoTranslated")}</p>}
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowOriginal((v) => !v)}>
              {showOriginal ? t("seeTranslation") : t("seeOriginal")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
