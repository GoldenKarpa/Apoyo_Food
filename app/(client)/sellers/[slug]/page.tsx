import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Bike, Handshake, ShoppingBag, type LucideIcon } from "lucide-react";
import type { FulfillmentMode } from "@prisma/client";

import { FoodImage } from "@/components/food-image";
import { ListingGrid } from "@/components/listing-grid";
import { MenuShelf, type MenuShelfItem } from "@/components/menu-shelf";
import { RegionMap } from "@/components/region-map";
import { SellerFollowHeader } from "@/components/seller-follow-header";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { CARD_SELECT, discoverable, withAvailability } from "@/lib/discovery";
import { publicSellerWhere } from "@/lib/visibility";
import { logDemand } from "@/lib/demand";
import { isSellerFollowed } from "@/lib/follows";
import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";

/**
 * `/sellers/[slug]` — the real seller profile (Slice 11, architecture Part F1,
 * `food (9)`'s corrected mockup — MENU SHELF as labelled rectangles, not the
 * circular highlights `food (8)`'s earlier draft shows).
 *
 * Replaces Slice 9's placeholder wholesale, keeping its PROFILE_VIEW demand
 * event and its ACTIVE-only 404 guard verbatim — a PENDING or SUSPENDED
 * seller's profile is reachable by direct URL even when it appears in no
 * directory query, so this 404s rather than rendering it.
 */

const FULFILLMENT_ICONS: Record<FulfillmentMode, LucideIcon> = {
  PICKUP: ShoppingBag,
  SELLER_DELIVERY: Bike,
  MEETUP: Handshake,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // LC-4 — gated like the page itself, so a hidden seller's NAME does not leak
  // through the document title / OG metadata of an otherwise-404 page.
  const seller = await prisma.foodSeller.findFirst({
    where: { ...(await publicSellerWhere()), slug },
    select: { displayName: true },
  });
  return { title: seller?.displayName ?? "Apoyo Food" };
}

export default async function SellerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // LC-4 — the direct-URL door. `notFound()` below is what makes a shared link
  // to a hidden seller behave exactly like a link to one that never existed.
  const seller = await prisma.foodSeller.findFirst({
    where: { ...(await publicSellerWhere()), slug },
    select: {
      id: true,
      slug: true,
      displayName: true,
      bio: true,
      areas: true,
      languages: true,
      specialties: true,
      fulfillmentModes: true,
      followerCount: true,
      lastStoryAt: true,
      coverImageCard: true,
      coverImageBlur: true,
      profileImageThumb: true,
      profileImageBlur: true,
      photos: {
        select: { pathCard: true, blurDataUrl: true, caption: true },
        orderBy: { sortOrder: "asc" },
      },
      highlights: {
        select: {
          id: true,
          title: true,
          coverImage: true,
          stories: {
            select: { pathCard: true, blurDataUrl: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!seller) notFound();

  const [t, ts, tf, session] = await Promise.all([
    getTranslations("client.sellerProfile"),
    getTranslations("client.sections"),
    getTranslations("fulfillmentModes"),
    getFoodSession(),
  ]);

  logDemand({ kind: "PROFILE_VIEW", sellerId: seller.id, userId: session?.userId ?? null });

  const [following, listingRows] = await Promise.all([
    isSellerFollowed(session?.userId ?? null, seller.id),
    prisma.foodListing.findMany({
      where: { ...(await discoverable()), sellerId: seller.id },
      select: CARD_SELECT,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const listings = withAvailability(listingRows);

  // ⚠ A highlight with zero linked stories is an empty shelf nobody filled yet
  // (Slice 8 seeded 21 groups, only 9 carry a story) — filtered here, before
  // <MenuShelf> ever sees it, rather than asking that component to special-case
  // an empty cover.
  const menuShelfItems: MenuShelfItem[] = seller.highlights
    .filter((h) => h.coverImage || h.stories.length > 0)
    .map((h) => ({
      id: h.id,
      title: h.title,
      cover: h.coverImage
        ? { src: h.coverImage, blurDataUrl: null }
        : h.stories[0]
          ? { src: h.stories[0].pathCard, blurDataUrl: h.stories[0].blurDataUrl }
          : null,
    }));

  return (
    <div className="flex flex-col gap-6">
      {seller.coverImageCard ? (
        <FoodImage
          src={seller.coverImageCard}
          alt=""
          aspect="cover"
          blurDataUrl={seller.coverImageBlur}
          sizes="(min-width: 768px) 800px, 100vw"
          priority
        />
      ) : (
        <div aria-hidden className="aspect-cover w-full rounded-image bg-sunken" />
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-3">
            <div className="relative -mt-12 shrink-0">
              {seller.profileImageThumb ? (
                <FoodImage
                  src={seller.profileImageThumb}
                  alt=""
                  aspect="thumb"
                  blurDataUrl={seller.profileImageBlur}
                  sizes="96px"
                  className="h-24 w-24 rounded-pill border-4 border-cream-bg"
                />
              ) : (
                <span
                  aria-hidden
                  className="block h-24 w-24 rounded-pill border-4 border-cream-bg bg-green-soft"
                />
              )}
              {seller.lastStoryAt !== null && (
                <span className="absolute -right-0.5 bottom-1 flex h-5 w-5 items-center justify-center rounded-pill border-2 border-cream-bg bg-teal">
                  <span className="sr-only">{ts("freshDot")}</span>
                </span>
              )}
            </div>
            <h1 className="font-display text-display font-semibold text-ink">{seller.displayName}</h1>
          </div>

          <SellerFollowHeader
            sellerId={seller.id}
            initialFollowing={following}
            initialFollowerCount={seller.followerCount}
            authenticated={!!session}
          />
        </div>

        {seller.bio && <p className="max-w-2xl text-body text-ink-muted">{seller.bio}</p>}

        {(seller.specialties.length > 0 || seller.languages.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {seller.specialties.map((s) => (
              <Chip key={`spec-${s}`}>{s}</Chip>
            ))}
            {seller.languages.map((l) => (
              <Chip key={`lang-${l}`} variant="outline">
                {l}
              </Chip>
            ))}
          </div>
        )}

        {seller.fulfillmentModes.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {seller.fulfillmentModes.map((mode) => {
              const Icon = FULFILLMENT_ICONS[mode];
              return (
                <div key={mode} className="flex items-center gap-2 text-label text-ink">
                  <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-green-soft">
                    <Icon aria-hidden className="h-4 w-4" />
                  </span>
                  {tf(mode)}
                </div>
              );
            })}
          </div>
        )}

        {seller.areas.length > 0 && (
          <RegionMap selected={seller.areas} readOnly className="max-w-sm" />
        )}
      </div>

      <MenuShelf items={menuShelfItems} href={`/stories/${seller.slug}`} label={t("menuShelf")} />

      <section className="flex flex-col gap-4">
        <SectionHeader title={t("listings", { count: listings.length })} />
        {listings.length > 0 ? (
          <ListingGrid listings={listings} priorityCount={4} session={session} />
        ) : (
          <p className="text-body text-ink-muted">{t("emptyListings")}</p>
        )}
      </section>

      {seller.photos.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title={t("gallery")} />
          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {seller.photos.map((photo, index) => (
              <FoodImage
                key={photo.pathCard}
                src={photo.pathCard}
                alt={photo.caption ?? ""}
                aspect="thumb"
                blurDataUrl={photo.blurDataUrl}
                sizes="200px"
                priority={index === 0}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
