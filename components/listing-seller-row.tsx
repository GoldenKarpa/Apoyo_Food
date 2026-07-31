import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { FoodImage } from "@/components/food-image";
import type { MealCardPhoto } from "@/components/meal-card";
import { cn } from "@/lib/utils";

/**
 * `/meals/[slug]`'s compact "seller card" (Slice 10, Part F1: "seller card").
 *
 * Deliberately NOT `<SellerCard>` — that component is the directory's full
 * cover-photo card (Slice 9's `/browse/sellers` and the home "cooks near you"
 * rail), which is too large for an inline intro sitting between a listing's
 * badges and its description. This is the compact row the mockup (`food (7)`)
 * shows instead: avatar, name, a freshness dot if the seller posted recently,
 * areas as a location line, one link through to the full profile.
 *
 * ⚠ No Follow button here, on purpose. The mockup shows one, but Follow is
 * Slice 11's real feature (`(FOOD, CLIENT)`-gated, with its own denormalized
 * counter) — stubbing it here with `<ComingSoon>` would register a feature key
 * this file's own slice never asked for. Slice 11 is free to add it to this
 * row directly, the same way it adds the real Follow button to `/sellers/[slug]`.
 */
export interface ListingSellerRowProps {
  href: string;
  name: string;
  avatar?: MealCardPhoto | null;
  /** Already-localized region names (Part G: areas only, never an address). */
  areas?: string[];
  /** Localized "N followers" string. */
  followerLabel?: string;
  hasFreshToday?: boolean;
  freshTodayLabel?: string;
  className?: string;
}

export function ListingSellerRow({
  href,
  name,
  avatar,
  areas = [],
  followerLabel,
  hasFreshToday = false,
  freshTodayLabel,
  className,
}: ListingSellerRowProps) {
  const meta = [areas.join(" · "), followerLabel].filter(Boolean).join(" · ");

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-card border border-hairline bg-card p-3 shadow-soft",
        "transition-colors duration-200 ease-soft hover:bg-sunken",
        className,
      )}
    >
      <div className="relative shrink-0">
        {avatar ? (
          <FoodImage
            src={avatar.src}
            alt=""
            aspect="thumb"
            blurDataUrl={avatar.blurDataUrl}
            sizes="48px"
            className="h-12 w-12 rounded-pill"
          />
        ) : (
          <span aria-hidden className="block h-12 w-12 rounded-pill bg-green-soft" />
        )}
        {hasFreshToday && (
          // The same freshness-dot treatment as `<SellerCard>` and
          // `<FreshTodayCard>` — Part E2: "one visual idea rendered twice".
          <span className="absolute -right-0.5 bottom-0 flex h-3.5 w-3.5 items-center justify-center rounded-pill border-2 border-card bg-teal">
            <span className="sr-only">{freshTodayLabel}</span>
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-display text-h2 font-semibold text-ink">{name}</span>
        {meta && <span className="truncate text-caption text-ink-muted">{meta}</span>}
      </div>

      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-ink-muted" />
    </Link>
  );
}
