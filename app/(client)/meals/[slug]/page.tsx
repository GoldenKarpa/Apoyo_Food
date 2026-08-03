import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import type { AvailabilityType, RegionKey } from "@prisma/client";

import { ListingGallery, type ListingGalleryPhoto } from "@/components/listing-gallery";
import { ListingRail } from "@/components/listing-grid";
import { ListingSellerRow } from "@/components/listing-seller-row";
import { ReportListingSheet } from "@/components/report-listing-sheet";
import { RequestOrderSheet } from "@/components/request-order-sheet";
import { AvailabilityStamp, type AvailabilityTone } from "@/components/ui/availability-stamp";
import { Chip } from "@/components/ui/chip";
import { SaveButton } from "@/components/ui/save-button";
import { SectionHeader } from "@/components/ui/section-header";
import { DIETARY_TAGS } from "@/lib/browse";
import { describeWindow, localDay } from "@/lib/availability";
import { buildWindowLabels } from "@/lib/window-labels";
import { DISCOVERABLE, moreFromSeller, mostSavedListings, similarInCategory } from "@/lib/discovery";
import { logDemand } from "@/lib/demand";
import { formatCentsTtd } from "@/lib/money";
import { occasionLabel } from "@/lib/occasion-tags";
import { getOrderingEnabled } from "@/lib/platform-settings";
import { AREA_COOKIE, isRegionKey } from "@/lib/regions";
import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { isListingSaved } from "@/lib/saves";

/**
 * `/meals/[slug]` — the real listing detail page (Slice 10, architecture Part
 * F1: "gallery, price, availability, seller card, similar, [Request order]").
 *
 * Replaces Slice 9's placeholder wholesale, exactly as that placeholder said
 * it would be — including the LISTING_VIEW demand event and the visibility
 * 404 guard it already carried, both kept verbatim here.
 */

const WINDOW_TONE: Record<AvailabilityType, AvailabilityTone> = {
  RECURRING_WEEKLY: "recurring",
  PREORDER: "preorder",
  DATE_RANGE: "seasonal",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await prisma.foodListing.findFirst({
    where: { slug, ...DISCOVERABLE },
    select: { title: true },
  });
  return { title: listing?.title ?? "Apoyo Food" };
}

export default async function MealDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const listing = await prisma.foodListing.findFirst({
    where: { slug, ...DISCOVERABLE },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      priceMode: true,
      priceCents: true,
      feedsCount: true,
      dietaryTags: true,
      ingredientTags: true,
      occasionTag: true,
      photos: {
        select: { pathFull: true, pathCard: true, blurDataUrl: true, caption: true },
        orderBy: { sortOrder: "asc" },
      },
      availabilityWindows: {
        select: {
          id: true,
          type: true,
          daysOfWeek: true,
          startsOn: true,
          endsOn: true,
          leadTimeDays: true,
          note: true,
        },
      },
      categories: {
        select: { category: { select: { id: true, slug: true, nameEn: true, nameEs: true, seasonal: true } } },
        orderBy: { category: { sortOrder: "asc" } },
      },
      seller: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          areas: true,
          profileImageThumb: true,
          profileImageBlur: true,
          followerCount: true,
          lastStoryAt: true,
          fulfillmentModes: true,
        },
      },
    },
  });
  if (!listing) notFound();

  const [locale, t, ta, tp, tdiet, toc, ts, session, cookieStore, orderingEnabled] = await Promise.all([
    getLocale(),
    getTranslations("client.meal"),
    getTranslations("availability"),
    getTranslations("price"),
    getTranslations("filters.dietaryTags"),
    getTranslations("occasionTags"),
    getTranslations("client.sections"),
    getFoodSession(),
    cookies(),
    getOrderingEnabled(),
  ]);

  // ⚠ Kept from Slice 9 verbatim: every card on the site already links here, so
  // this is where the LISTING_VIEW signal exists to be captured — Part C says
  // demand history is cheap to log and impossible to backfill.
  logDemand({
    kind: "LISTING_VIEW",
    listingId: listing.id,
    sellerId: listing.seller.id,
    userId: session?.userId ?? null,
  });

  const areaCookie = cookieStore.get(AREA_COOKIE)?.value;
  const area: RegionKey | null = isRegionKey(areaCookie) ? areaCookie : null;

  const primaryCategory = listing.categories[0]?.category ?? null;

  const [saved, moreFromThisSeller, similar, popularRaw] = await Promise.all([
    isListingSaved(session?.userId ?? null, listing.id),
    moreFromSeller(listing.seller.id, listing.id),
    primaryCategory ? similarInCategory(primaryCategory.id, listing.id) : Promise.resolve([]),
    mostSavedListings(9, new Date(), area),
  ]);
  // "Popular in your area" recommends OTHER dishes — the current listing
  // showing up in its own rec rail would read as a bug, not a recommendation.
  const popular = popularRaw.filter((l) => l.id !== listing.id).slice(0, 8);

  const galleryPhotos: ListingGalleryPhoto[] = listing.photos.map((p) => ({
    full: p.pathFull,
    card: p.pathCard,
    blurDataUrl: p.blurDataUrl,
    alt: p.caption,
  }));

  // Slice 14 factored this construction into lib/window-labels.ts so the
  // seller's window builder renders identical wording — one source, not two
  // that could drift.
  const windowLabels = buildWindowLabels(ta, ta.raw("days") as string[], locale);

  const categoryName = primaryCategory
    ? locale === "es"
      ? primaryCategory.nameEs
      : primaryCategory.nameEn
    : null;

  return (
    <>
      <div className="flex flex-col gap-6 pb-20 md:pb-0">
        <ListingGallery photos={galleryPhotos} title={listing.title} />

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-display font-semibold text-ink">{listing.title}</h1>
            <SaveButton
              listingId={listing.id}
              initialSaved={saved}
              authenticated={!!session}
              className="mt-1 shrink-0"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {listing.priceMode === "QUOTE" || listing.priceCents == null ? (
              <span className="text-h1 font-semibold text-terracotta">{tp("onRequest")}</span>
            ) : (
              <span className="text-h1 font-semibold text-terracotta">
                {listing.priceMode === "STARTING_AT" ? `${tp("startingAt")} ` : ""}
                {formatCentsTtd(listing.priceCents)}
              </span>
            )}
            {listing.feedsCount != null && (
              <span className="text-label text-ink-muted">{t("feeds", { count: listing.feedsCount })}</span>
            )}
          </div>

          {listing.availabilityWindows.length > 0 && (
            <div className="flex flex-col gap-2">
              {listing.availabilityWindows.map((window) => (
                <div key={window.id} className="flex flex-wrap items-center gap-2">
                  <AvailabilityStamp size="lg" tone={WINDOW_TONE[window.type]}>
                    {describeWindow(window, windowLabels)}
                  </AvailabilityStamp>
                  {window.note && <span className="text-caption text-ink-muted">{window.note}</span>}
                </div>
              ))}
            </div>
          )}

          {(listing.dietaryTags.length > 0 || listing.occasionTag || listing.ingredientTags.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {listing.dietaryTags.map((tag) => (
                <Chip key={`diet-${tag}`}>
                  {(DIETARY_TAGS as readonly string[]).includes(tag) ? tdiet(tag) : tag}
                </Chip>
              ))}
              {listing.occasionTag && (
                <Chip variant="outline">{occasionLabel(listing.occasionTag, toc)}</Chip>
              )}
              {listing.ingredientTags.map((tag) => (
                <Chip key={`ingredient-${tag}`}>{tag}</Chip>
              ))}
            </div>
          )}

          <ListingSellerRow
            href={`/sellers/${listing.seller.slug}`}
            name={listing.seller.displayName}
            avatar={
              listing.seller.profileImageThumb
                ? { src: listing.seller.profileImageThumb, blurDataUrl: listing.seller.profileImageBlur }
                : null
            }
            areas={listing.seller.areas.map((a) => ts.raw(`areaNames.${a}`) as string)}
            followerLabel={ts("followers", { count: listing.seller.followerCount })}
            hasFreshToday={listing.seller.lastStoryAt !== null}
            freshTodayLabel={ts("freshDot")}
          />

          <div className="flex flex-col gap-2">
            <h2 className="font-display text-h1 font-semibold text-ink">{t("about")}</h2>
            <p className="whitespace-pre-line text-body text-ink-muted">{listing.description}</p>
          </div>

          <ReportListingSheet listingId={listing.id} />
        </div>

        {moreFromThisSeller.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionHeader title={ts("moreFromSeller")} />
            <ListingRail listings={moreFromThisSeller} label={ts("moreFromSeller")} session={session} />
          </section>
        )}

        {similar.length > 0 && categoryName && (
          <section className="flex flex-col gap-4">
            <SectionHeader title={ts("similarIn", { category: categoryName })} />
            <ListingRail
              listings={similar}
              label={ts("similarIn", { category: categoryName })}
              session={session}
            />
          </section>
        )}

        {popular.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionHeader title={area ? ts("popularInArea", { area: ts.raw(`areaNames.${area}`) as string }) : ts("popularArea")} />
            <ListingRail
              listings={popular}
              label={area ? ts("popularInArea", { area: ts.raw(`areaNames.${area}`) as string }) : ts("popularArea")}
              session={session}
            />
          </section>
        )}
      </div>

      {/* Sticky "Request order" CTA (Part F1) — the real request flow (Slice
          17), replacing the Phase-1 ComingSoon stub. Above the mobile bottom
          tab bar (56px + the safe-area inset), a plain floating button on
          desktop where the tab bar doesn't exist. */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-hairline bg-cream-bg px-screen py-3 shadow-soft md:inset-x-auto md:bottom-6 md:right-6 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <RequestOrderSheet
          listingId={listing.id}
          fulfillmentModes={listing.seller.fulfillmentModes}
          minDateIso={localDay().iso}
          orderingEnabled={orderingEnabled}
          authenticated={!!session}
        />
      </div>
    </>
  );
}
