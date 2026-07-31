import * as React from "react";
import Link from "next/link";

import { FoodImage } from "@/components/food-image";
import {
  AvailabilityStamp,
  type AvailabilityTone,
} from "@/components/ui/availability-stamp";
import { SaveButton } from "@/components/ui/save-button";
import { formatCentsTtd } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * `<MealCard>` — architecture Part F3's own anatomy, in its own order:
 * 4:3 photo → dish name in the serif → price in `--terracotta` → availability
 * stamp → seller mini-row.
 *
 * ── Price rendering is not negotiable at the call site ──
 * The card takes `priceCents` (what `FoodListing.priceCents` actually holds,
 * Part D) and formats it through `lib/money.ts`. Callers cannot pass a
 * pre-formatted string, which is what makes the €-denominated mockups
 * unreproducible: there is no code path from this component to a currency symbol
 * other than `$… TTD`. `priceMode` is handled here too — a QUOTE listing has no
 * price at all and must say so rather than render `$0 TTD`, and STARTING_AT
 * needs its "Desde/From" prefix (Emergent `food (7)`: "Desde $120 TTD").
 *
 * ── Why the whole card is one link ──
 * A card with a linked title and a separately linked photo is two tab stops and
 * two identical announcements for one destination. One `<Link>` wraps
 * everything, and the seller name renders as text inside it rather than as a
 * nested link — nested anchors are invalid HTML and the parser silently
 * restructures them, which is exactly how Apparel's equivalent slice broke
 * hydration on every page carrying a stub. Slice 11's seller profile is reached
 * from the profile page, not from inside a meal card.
 *
 * ── Why the save heart is a SIBLING of the link, not a child of it (Slice 10) ──
 * `<button>` is interactive content and the HTML spec excludes interactive
 * content from `<a>` — the same nesting rule the seller name already respects,
 * just tripped by a different element. So the outer `<div>` carries the card's
 * border/padding/animation (and `relative`, for the heart's absolute
 * positioning); the `<Link>` inside is `display: contents` — no box of its own,
 * so its children still lay out directly in the parent flex column and the
 * whole photo+text area stays one click target — and `<SaveButton>` sits beside
 * it, positioned over the photo's corner.
 *
 * ── Motion ──
 * Blur-up on the photo (via `<FoodImage>`, never a spinner) plus a card fade-in
 * on mount, both 200–300ms ease-out per Part F3. The hover lift is desktop-only
 * by nature — there is no hover state on a phone — and is a shadow/translate
 * change rather than a colour change so it cannot alter any measured contrast.
 */

export interface MealCardPhoto {
  /** Storage key from the ingest pipeline, e.g. `listings/<id>-card.webp`. */
  src: string;
  blurDataUrl?: string | null;
}

export interface MealCardProps {
  href: string;
  title: string;
  /** Integer TTD cents (Part D). Null only for QUOTE listings. */
  priceCents: number | null;
  priceMode: "FIXED" | "STARTING_AT" | "QUOTE";
  /** Localized "From" / "Desde" prefix — required when priceMode is STARTING_AT. */
  startingAtLabel?: string;
  /** Localized "Price on request" copy — required when priceMode is QUOTE. */
  quoteLabel?: string;
  photo?: MealCardPhoto | null;
  /** Localized alt text; falls back to the dish name. */
  photoAlt?: string;
  availability?: { tone: AvailabilityTone; label: string } | null;
  seller?: { name: string; avatar?: MealCardPhoto | null } | null;
  /** Above-the-fold cards only — everything else stays lazy (Part F3). */
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** Slice 10's save heart. Omitted entirely renders no heart at all. */
  save?: { listingId: string; initialSaved: boolean; authenticated: boolean };
}

function PriceLine({
  priceCents,
  priceMode,
  startingAtLabel,
  quoteLabel,
}: Pick<MealCardProps, "priceCents" | "priceMode" | "startingAtLabel" | "quoteLabel">) {
  if (priceMode === "QUOTE" || priceCents == null) {
    // A quote listing has no number to show. Rendering `$0 TTD` here would be a
    // lie the DB itself forbids — `food_listings_price_by_mode` makes
    // priceCents NULL iff QUOTE (Slice 2).
    return <span className="text-label font-medium text-terracotta">{quoteLabel ?? "—"}</span>;
  }

  return (
    <span className="text-label font-medium text-terracotta">
      {priceMode === "STARTING_AT" && startingAtLabel ? `${startingAtLabel} ` : ""}
      {formatCentsTtd(priceCents)}
    </span>
  );
}

export function MealCard({
  href,
  title,
  priceCents,
  priceMode,
  startingAtLabel,
  quoteLabel,
  photo,
  photoAlt,
  availability,
  seller,
  priority = false,
  sizes = "(min-width: 768px) 25vw, 50vw",
  className,
  save,
}: MealCardProps) {
  return (
    <div
      className={cn(
        "group relative flex animate-card-in flex-col gap-3 rounded-card border border-hairline bg-card p-3 shadow-soft",
        "transition-[transform,box-shadow] duration-200 ease-soft md:hover:-translate-y-0.5",
        className,
      )}
    >
      <Link href={href} className="contents">
        {photo ? (
          <FoodImage
            src={photo.src}
            alt={photoAlt ?? title}
            aspect="meal"
            blurDataUrl={photo.blurDataUrl}
            sizes={sizes}
            priority={priority}
          />
        ) : (
          // No photo is a real state (a seller mid-onboarding, Slice 13). A
          // sunken frame at the right ratio holds the grid rhythm; an empty div
          // would collapse the card.
          <div aria-hidden className="aspect-meal w-full rounded-image bg-sunken" />
        )}

        <div className="flex flex-col gap-2 px-1 pb-1">
          {/* Clamped to two lines so a long Spanish title cannot break the
              grid's rhythm — Part F3 budgets ~30% expansion.
              ⚠ Slice 12: `<h2>`, not `<h3>` — every real page composing this
              card sits it directly under either a page `<h1>` (`/browse`,
              `/saved`, `/categories/[slug]`) or an `<h2>` `<SectionHeader>`
              rail label (home, search, the meal-detail rec rails), and an
              `<h3>` skipped a level in the first group. Lighthouse's own
              `heading-order` audit caught it on `/browse`; `text-h2` in the
              className is the unrelated TYPE-SCALE token (font-size), not the
              semantic level — the two happen to share a name. */}
          <h2 className="line-clamp-2 font-display text-h2 font-semibold text-ink">{title}</h2>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <PriceLine
              priceCents={priceCents}
              priceMode={priceMode}
              startingAtLabel={startingAtLabel}
              quoteLabel={quoteLabel}
            />
            {availability && (
              <AvailabilityStamp tone={availability.tone}>{availability.label}</AvailabilityStamp>
            )}
          </div>

          {seller && (
            <div className="flex items-center gap-2 pt-1">
              {seller.avatar ? (
                <FoodImage
                  src={seller.avatar.src}
                  alt=""
                  aspect="thumb"
                  blurDataUrl={seller.avatar.blurDataUrl}
                  sizes="24px"
                  className="h-6 w-6 shrink-0 rounded-pill"
                />
              ) : (
                <span aria-hidden className="h-6 w-6 shrink-0 rounded-pill bg-green-soft" />
              )}
              <span className="truncate text-caption text-ink-muted">{seller.name}</span>
            </div>
          )}
        </div>
      </Link>

      {save && (
        <SaveButton
          listingId={save.listingId}
          initialSaved={save.initialSaved}
          authenticated={save.authenticated}
          className="absolute right-4 top-4"
        />
      )}
    </div>
  );
}
