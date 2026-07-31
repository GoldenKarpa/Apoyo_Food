import * as React from "react";
import Link from "next/link";

import { FoodImage } from "@/components/food-image";
import type { MealCardPhoto } from "@/components/meal-card";
import { cn } from "@/lib/utils";

/**
 * `<FreshTodayCard>` — architecture Part E2's signature component, and the one
 * place this codebase most has to resist an obvious default.
 *
 * Part E2 reframes ephemeral 24h content as a **daily specials board**, not a
 * stories rail. The mechanics are a widely-used UI convention and are kept; the
 * presentation is deliberately not. Four rules, all of them load-bearing:
 *
 *  1. **Rounded-RECTANGULAR cards, never circular avatar rings.** The ring is
 *     the social-media metaphor that does not fit a food marketplace, and it is
 *     also what would make this look derivative.
 *  2. **A small teal freshness dot** (Part F3 fixes teal for this), with a
 *     steam-wisp mark beside it — the card says "this is fresh right now".
 *  3. **The availability window renders ON the card** ("9:00–15:00",
 *     "Por encargo"), because Part E2 is explicit that the card must convey
 *     *what's fresh right now*, not merely *that someone posted*.
 *  4. **Seen/unseen is a card BORDER treatment**, not a ring. Unseen takes a
 *     2px green border; seen takes the ordinary hairline. Slice 11 supplies the
 *     state from `FoodStoryView`.
 *
 * The window pill is ink on an opaque `card` surface floated over the bottom of
 * the photo (12.1:1) rather than translucent-over-photo: an alpha pill's
 * contrast depends on whatever pixels are behind it, which no measurement can
 * constrain. Same reasoning as `<CategoryCard>`'s label band.
 *
 * Stored aspect is 4:5 (Slice 4's `STORY_VARIANTS`) so the full-screen viewer
 * in Slice 11 has real pixels; the rail crops it in CSS, which is where Part
 * F3's "Fresh Today thumbnails 1:1" line applies.
 */
export interface FreshTodayCardProps {
  href: string;
  /** Seller display name — the card's own label. */
  sellerName: string;
  photo?: MealCardPhoto | null;
  /** Localized alt text; falls back to the seller name. */
  photoAlt?: string;
  /** Already-localized window copy, e.g. "9:00–15:00" or "Por encargo". */
  windowLabel?: string | null;
  /** From `FoodStoryView` (Slice 11). Unseen entries lead the rail. */
  seen?: boolean;
  /** Localized accessible label for the freshness dot. */
  freshLabel?: string;
  className?: string;
}

/**
 * Part E2's mark: "a small teal freshness dot + steam-wisp icon". Inline rather
 * than a lucide icon because no icon set has "steam", and it is a few hundred
 * bytes.
 *
 * ⚠ The first version was two tall S-curves side by side, which at this size
 * rendered as a double chevron — it read as "»", not as steam. Caught by looking
 * at a screenshot, which is the only way this class of thing gets caught. The
 * shape that works is the literal one: a solid dot with three short curls rising
 * off it, at three different heights.
 */
function SteamWisp() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none">
      <circle cx="8" cy="12" r="2" fill="currentColor" />
      <path
        d="M5.4 9.4c.9-.8.9-1.5 0-2.3M8 9c1-1 1-1.9 0-2.9M10.6 9.4c.9-.8.9-1.5 0-2.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FreshTodayCard({
  href,
  sellerName,
  photo,
  photoAlt,
  windowLabel,
  seen = false,
  freshLabel,
  className,
}: FreshTodayCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex w-[9.5rem] shrink-0 animate-card-in flex-col gap-2 rounded-card bg-card p-2 shadow-soft",
        "transition-[transform,box-shadow] duration-200 ease-soft md:hover:-translate-y-0.5",
        // Rule 4: seen/unseen as a border, never a ring.
        seen ? "border border-hairline" : "border-2 border-green",
        className,
      )}
    >
      <div className="relative">
        {photo ? (
          <FoodImage
            src={photo.src}
            alt={photoAlt ?? sellerName}
            aspect="story"
            blurDataUrl={photo.blurDataUrl}
            sizes="152px"
          />
        ) : (
          <div aria-hidden className="aspect-[4/5] w-full rounded-image bg-sunken" />
        )}

        {/* Rule 2: the freshness dot + steam wisp, teal, top-right. */}
        <span className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-pill bg-teal-soft text-teal">
          <SteamWisp />
          <span className="sr-only">{freshLabel}</span>
        </span>

        {/* Rule 3: the availability window, on the card. */}
        {windowLabel && (
          <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-pill bg-card px-2 py-0.5 text-center text-caption font-medium text-ink">
            {windowLabel}
          </span>
        )}
      </div>

      <p className="line-clamp-2 px-1 pb-1 text-caption font-medium text-ink">{sellerName}</p>
    </Link>
  );
}
