"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * ⚠ SCAFFOLDING — deleted by Slice 7 with `translation-proof.tsx`.
 *
 * The interactive half: the "ver original" toggle. Split into a client
 * component because the parent is a Server Component that does the (server-only)
 * file read and translation, and only this bit needs state.
 *
 * The presentation follows Part F3's order-thread bubble rule — **original
 * prominent, translation smaller and lighter beneath** — so Slice 18 inherits
 * the intended treatment rather than inventing it. Toggling never re-fetches
 * anything: both strings were already resolved server-side from the stored row.
 */
export function TranslationProofClient({
  text,
  original,
  isTranslated,
  labels,
}: {
  text: string;
  original: string;
  isTranslated: boolean;
  labels: { autoTranslated: string; seeOriginal: string; seeTranslation: string };
}) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div className="flex max-w-xl flex-col gap-2 rounded-card bg-green-soft p-4">
      <p className="text-body text-ink">{showOriginal ? original : text}</p>

      {isTranslated && (
        <>
          {!showOriginal && (
            <p className="text-caption text-ink-muted">{labels.autoTranslated}</p>
          )}
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowOriginal((v) => !v)}>
              {showOriginal ? labels.seeTranslation : labels.seeOriginal}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
