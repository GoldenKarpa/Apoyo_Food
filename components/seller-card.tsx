import * as React from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { FoodImage } from "@/components/food-image";
import { Chip } from "@/components/ui/chip";
import type { MealCardPhoto } from "@/components/meal-card";
import { cn } from "@/lib/utils";

/**
 * `<SellerCard>` — the directory card behind `/browse/sellers` (Slice 9) and the
 * "Sellers near you" home section (Part E1).
 *
 * Follows Part F3's seller-profile header anatomy at card scale: 16:9 cover,
 * overlapping round avatar, teal verification check, area/specialty chips,
 * follower count.
 *
 * ── Two decisions worth not re-litigating ──
 *
 * **Areas, never an address.** Part G calls seller home-address privacy the
 * highest-stakes privacy rule in this product — pickup means a customer visiting
 * someone's home kitchen — so the public surfaces expose the `RegionKey` area
 * only, and exact location is exchanged in the order thread *after* acceptance.
 * This component therefore takes `areas: string[]` of already-localized region
 * names and has no address prop at all: the safe thing is the only thing it can
 * render.
 *
 * **The verification check is teal and decorative-plus-labelled.** Part F3 fixes
 * teal for verification checks. It carries an accessible label rather than an
 * `aria-hidden` icon alone, because "verified" is information, not decoration.
 * Nothing sets it before Phase 9 (`FoodSellerVerification`), so it defaults off.
 *
 * The freshness dot (`hasFreshToday`) is the same teal treatment `<FreshTodayCard>`
 * uses — Part E2 asks for "the same freshness-dot treatment on seller cards and
 * profiles", so it is one visual idea rendered twice rather than two.
 */
export interface SellerCardProps {
  href: string;
  name: string;
  /** Already-localized region names — never an address (Part G). */
  areas?: string[];
  specialties?: string[];
  cover?: MealCardPhoto | null;
  avatar?: MealCardPhoto | null;
  /** Localized "N followers" string — pluralization belongs to the catalogue. */
  followerLabel?: string;
  verified?: boolean;
  /** Localized accessible label for the verification check. */
  verifiedLabel?: string;
  /** Seller posted to Fresh Today inside the window (Part E2's `lastStoryAt`). */
  hasFreshToday?: boolean;
  /** Localized accessible label for the freshness dot. */
  freshTodayLabel?: string;
  className?: string;
}

export function SellerCard({
  href,
  name,
  areas = [],
  specialties = [],
  cover,
  avatar,
  followerLabel,
  verified = false,
  verifiedLabel,
  hasFreshToday = false,
  freshTodayLabel,
  className,
}: SellerCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex animate-card-in flex-col overflow-hidden rounded-card border border-hairline bg-card shadow-soft",
        "transition-[transform,box-shadow] duration-200 ease-soft md:hover:-translate-y-0.5",
        className,
      )}
    >
      {cover ? (
        <FoodImage
          src={cover.src}
          alt=""
          aspect="cover"
          blurDataUrl={cover.blurDataUrl}
          sizes="(min-width: 768px) 33vw, 100vw"
          className="rounded-none"
        />
      ) : (
        <div aria-hidden className="aspect-cover w-full bg-sunken" />
      )}

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-end gap-3">
          <div className="relative -mt-12 shrink-0">
            {avatar ? (
              <FoodImage
                src={avatar.src}
                alt=""
                aspect="thumb"
                blurDataUrl={avatar.blurDataUrl}
                sizes="64px"
                className="h-16 w-16 rounded-pill border-4 border-card"
              />
            ) : (
              <span
                aria-hidden
                className="block h-16 w-16 rounded-pill border-4 border-card bg-green-soft"
              />
            )}
            {hasFreshToday && (
              // Part E2: a freshness DOT, never a ring around the avatar — the
              // ring is the social-media metaphor this product is deliberately
              // not importing.
              <span className="absolute -right-0.5 bottom-1 flex h-4 w-4 items-center justify-center rounded-pill border-2 border-card bg-teal">
                <span className="sr-only">{freshTodayLabel}</span>
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-display text-h2 font-semibold text-ink">{name}</h3>
              {verified && (
                <span className="shrink-0 text-teal">
                  <BadgeCheck aria-hidden className="h-4 w-4" />
                  <span className="sr-only">{verifiedLabel}</span>
                </span>
              )}
            </div>
            {followerLabel && <p className="text-caption text-ink-muted">{followerLabel}</p>}
          </div>
        </div>

        {(areas.length > 0 || specialties.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {areas.map((area) => (
              <Chip key={`area-${area}`} variant="neutral">
                {area}
              </Chip>
            ))}
            {specialties.map((specialty) => (
              <Chip key={`spec-${specialty}`} variant="outline">
                {specialty}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
