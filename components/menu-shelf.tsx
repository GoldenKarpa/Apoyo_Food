import * as React from "react";
import Link from "next/link";

import { FoodImage } from "@/components/food-image";
import { Rail } from "@/components/ui/rail";
import type { MealCardPhoto } from "@/components/meal-card";
import { cn } from "@/lib/utils";

/**
 * `<MenuShelf>` — the seller profile's highlight rail (Slice 11, architecture
 * Part E2, `food (9)`'s own corrected mockup).
 *
 * ⚠ **Labelled RECTANGULAR cards, never IG highlight circles.** This is the
 * one point the architecture doc states twice, once on `FoodStoryHighlight`'s
 * own schema comment and once in Part E2's prose — the mockup set itself has
 * both versions (`food (8)`'s circles are the earlier, superseded draft;
 * `food (9)`'s "MENU SHELF" rectangles are the corrected one), so the wrong
 * one is one screenshot away from being copied by mistake. `<FoodImage>`'s
 * standard `rounded-image` (16px) is what makes these read as the same family
 * as every other card in the app rather than an Instagram borrowing.
 *
 * ⚠ **A highlight with zero linked stories renders nothing at all**, filtered
 * by the caller (`/sellers/[slug]`) before this component ever sees it. Slice
 * 8 seeded 21 highlight groups but only 9 carry a story — the other 12 are
 * empty shelves nobody filled yet, and an empty rectangle with no photo and no
 * content is a worse look than the shelf simply having fewer items.
 *
 * Each card links to the SAME Fresh Today viewer as the rest of the seller's
 * active stories (`/stories/[sellerSlug]`) rather than a highlight-scoped
 * viewer — a genuinely separate "play just this shelf" mode is real, scoped
 * future work, not something this slice's seed (mostly one story per
 * highlight) needs yet.
 */
export interface MenuShelfItem {
  id: string;
  title: string;
  cover?: MealCardPhoto | null;
}

export function MenuShelf({
  items,
  href,
  label,
  className,
}: {
  items: MenuShelfItem[];
  /** `/stories/[sellerSlug]` — every card links here. */
  href: string;
  /** Localized "Menu shelf" heading. */
  label: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <h2 className="font-display text-h2 font-semibold text-ink">{label}</h2>
      <Rail label={label}>
        {items.map((item) => (
          <Link key={item.id} href={href} className="flex w-20 shrink-0 flex-col items-center gap-1.5">
            {item.cover ? (
              <FoodImage
                src={item.cover.src}
                alt=""
                aspect="thumb"
                blurDataUrl={item.cover.blurDataUrl}
                sizes="80px"
                className="h-20 w-20"
              />
            ) : (
              <div aria-hidden className="h-20 w-20 rounded-image bg-sunken" />
            )}
            <span className="line-clamp-2 text-center text-caption font-medium text-ink">{item.title}</span>
          </Link>
        ))}
      </Rail>
    </div>
  );
}
