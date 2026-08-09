import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { FoodImage } from "@/components/food-image";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { ListingActiveToggle } from "@/components/seller/listing-active-toggle";
import { loadSellerWorkspace } from "@/lib/seller";
import { sellerListingSummaries } from "@/lib/listing";
import { formatCentsTtd } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.listings");
  return { title: t("title") };
}

/**
 * `/food/listings` — every dish this seller owns (architecture F1).
 *
 * ⚠ No admin-approval gate here, and none needed: a `PENDING` seller can
 * create and edit listings freely (the slice's own done-when says so
 * explicitly) — what gates a listing reaching a BUYER is `DISCOVERABLE`
 * (`lib/discovery.ts`), which additionally requires the SELLER to be ACTIVE.
 * A PENDING seller building out their menu ahead of approval is the intended
 * flow, not an edge case to guard against.
 */
export default async function SellerListingsPage() {
  const t = await getTranslations("seller.listings");
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/onboarding");

  const listings = await sellerListingSummaries(workspace.seller.id);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>
          <p className="text-body text-ink">{t("intro")}</p>
        </div>
        <Button asChild>
          <Link href="/food/listings/new">{t("add")}</Link>
        </Button>
      </header>

      {listings.length === 0 ? (
        <p className="rounded-card border border-dashed border-hairline bg-sunken p-8 text-center text-label text-ink">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {listings.map((listing) => (
            <li
              key={listing.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-hairline bg-card p-4"
            >
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
                <Link href={`/food/listings/${listing.id}`} className="font-display text-h3 font-semibold text-ink hover:underline">
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
          ))}
        </ul>
      )}
    </>
  );
}
