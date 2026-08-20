import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { FoodImage } from "@/components/food-image";
import { ListingActiveToggle } from "@/components/seller/listing-active-toggle";
import { formatCentsTtd } from "@/lib/money";

/**
 * One row of the seller's menu (`/food/listings`, Slice 14).
 *
 * ## ⚠ Extracted rather than copied (PD-S10)
 *
 * Same reasoning as `<SellerOrderRow>` next door: this markup used to live
 * inline in `app/food/(dashboard)/listings/page.tsx`, and the demo must render
 * the REAL row so it cannot drift from the product
 * (`Provider_Demo_Plan.md` §2.3a).
 *
 * ## ⚠ It keeps its real links, and the demo neutralises them from outside
 *
 * The title and the Edit button both go to `/food/listings/[id]`, which is
 * outside the demo's tour and would eject a visitor onto a page demanding a
 * real `FoodSeller` row. Deliberately NOT solved with a `demo` prop here —
 * threading demo awareness through production components is precisely the
 * trade §2.3 rejects. The demo shell intercepts anchor clicks in its own
 * wrapper and explains, so this file stays unaware that a demo exists.
 *
 * `<ListingActiveToggle>` inside it is genuinely interactive in the demo,
 * because it mutates through the `useFoodActions()` seam rather than by
 * navigating.
 *
 * ## ⚠ Isomorphic — no `"use client"`, no `async`
 *
 * The real page server-renders it; the demo renders the same file client-side,
 * where the row must re-render the instant a fixture listing is paused.
 */

export interface SellerListingRowData {
  id: string;
  title: string;
  priceMode: "FIXED" | "STARTING_AT" | "QUOTE";
  priceCents: number | null;
  active: boolean;
  takenDownAt: Date | null;
  photos: { pathThumb: string; blurDataUrl: string | null }[];
  _count: { availabilityWindows: number };
}

export function SellerListingRow({ listing }: { listing: SellerListingRowData }) {
  const t = useTranslations("seller.listings");

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-card border border-hairline bg-card p-4">
      {listing.photos[0] ? (
        <FoodImage
          src={listing.photos[0].pathThumb}
          alt={listing.title}
          aspect="thumb"
          blurDataUrl={listing.photos[0].blurDataUrl}
          sizes="64px"
          className="h-16 w-16 shrink-0"
          surface="seller"
        />
      ) : (
        <div aria-hidden className="h-16 w-16 shrink-0 rounded-image bg-sunken" />
      )}

      <div className="flex min-w-[160px] flex-1 flex-col gap-1">
        <Link
          href={`/food/listings/${listing.id}`}
          className="font-display text-h3 font-semibold text-ink hover:underline"
        >
          {listing.title}
        </Link>
        <p className="text-caption text-ink">
          {listing.priceMode === "QUOTE"
            ? t("quotePrice")
            : listing.priceCents != null
              ? formatCentsTtd(listing.priceCents)
              : "—"}
          {" · "}
          {t("windowCount", { count: listing._count.availabilityWindows })}
        </p>
      </div>

      {listing.takenDownAt ? (
        <span className="rounded-pill bg-error/10 px-3 py-1 text-caption font-medium text-error">
          {t("takenDown")}
        </span>
      ) : (
        <ListingActiveToggle listingId={listing.id} active={listing.active} />
      )}

      <Button variant="outline" asChild>
        <Link href={`/food/listings/${listing.id}`}>{t("edit")}</Link>
      </Button>
    </li>
  );
}
