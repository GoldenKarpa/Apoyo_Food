"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { AvailabilityType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { AvailabilityStamp, type AvailabilityTone } from "@/components/ui/availability-stamp";
import { describeWindow, type AvailabilityWindowLike } from "@/lib/availability";
import { buildWindowLabels } from "@/lib/window-labels";
import { removeAvailabilityWindow } from "@/lib/actions/listing-availability";

const WINDOW_TONE: Record<AvailabilityType, AvailabilityTone> = {
  RECURRING_WEEKLY: "recurring",
  PREORDER: "preorder",
  DATE_RANGE: "seasonal",
};

export interface WindowRow extends AvailabilityWindowLike {
  id: string;
}

/**
 * The listing editor's read side for windows — same `describeWindow` +
 * `<AvailabilityStamp>` pairing the buyer's `/meals/[slug]` page renders
 * (`lib/window-labels.ts` is what keeps the wording identical), so "what a
 * seller sees they've configured" and "what a buyer sees it means" are
 * provably the same sentence, not two independent renderings that happen to
 * agree today.
 */
export function AvailabilityWindowList({ listingId, windows }: { listingId: string; windows: WindowRow[] }) {
  const t = useTranslations("availability");
  const ts = useTranslations("seller.availabilityForm");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const labels = buildWindowLabels(t, t.raw("days") as string[], locale);

  function remove(windowId: string) {
    if (!window.confirm(ts("removeConfirm"))) return;
    startTransition(async () => {
      await removeAvailabilityWindow(listingId, windowId);
      router.refresh();
    });
  }

  if (windows.length === 0) {
    return <p className="text-label text-ink">{ts("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {windows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-control border border-hairline bg-card p-3">
          <AvailabilityStamp size="lg" tone={WINDOW_TONE[row.type]}>
            {describeWindow(row, labels)}
          </AvailabilityStamp>
          {row.note && <span className="text-caption text-ink-muted">{row.note}</span>}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={pending}
            aria-label={ts("remove")}
            className="ml-auto text-error hover:bg-error/10"
            onClick={() => remove(row.id)}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
