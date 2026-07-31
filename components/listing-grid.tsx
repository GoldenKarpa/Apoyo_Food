import { getTranslations } from "next-intl/server";

import { MealCard } from "@/components/meal-card";
import { Rail } from "@/components/ui/rail";
import { cn } from "@/lib/utils";
import type { ListingCard } from "@/lib/discovery";

/**
 * The one place a `FoodListing` row becomes `<MealCard>` props.
 *
 * Every surface that shows meals — home rails, `/browse`, `/categories/[slug]`,
 * `/search`, and Slice 10's "more from this seller" — renders through here, so
 * the mapping from a database row to a card is made once. That matters more
 * than it looks: the price/priceMode/quote-label triple, the availability tone
 * and the seller mini-row are three separate chances to render a listing
 * differently on two pages, and a marketplace where the same dish looks
 * different in a rail and in a grid reads as broken.
 */

async function cardProps(listing: ListingCard) {
  const [ta, tp] = await Promise.all([getTranslations("availability"), getTranslations("price")]);

  return {
    href: `/meals/${listing.slug}`,
    title: listing.title,
    priceCents: listing.priceCents,
    priceMode: listing.priceMode,
    startingAtLabel: tp("startingAt"),
    quoteLabel: tp("onRequest"),
    photo: listing.photos[0]
      ? { src: listing.photos[0].pathCard, blurDataUrl: listing.photos[0].blurDataUrl }
      : null,
    availability:
      listing.availability.labelKey === "unavailable"
        ? null
        : {
            tone: listing.availability.tone,
            label: ta(listing.availability.labelKey, listing.availability.labelValues),
          },
    seller: {
      name: listing.seller.displayName,
      avatar: listing.seller.profileImageThumb
        ? {
            src: listing.seller.profileImageThumb,
            blurDataUrl: listing.seller.profileImageBlur,
          }
        : null,
    },
  };
}

export async function ListingGrid({
  listings,
  className,
  priorityCount = 2,
}: {
  listings: ListingCard[];
  className?: string;
  /** Above-the-fold cards get eager images; everything else stays lazy. */
  priorityCount?: number;
}) {
  const cards = await Promise.all(listings.map(cardProps));

  return (
    <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4", className)}>
      {cards.map((card, index) => (
        <MealCard key={card.href} {...card} priority={index < priorityCount} />
      ))}
    </div>
  );
}

export async function ListingRail({
  listings,
  label,
}: {
  listings: ListingCard[];
  label: string;
}) {
  const cards = await Promise.all(listings.map(cardProps));

  return (
    <Rail label={label}>
      {cards.map((card) => (
        <MealCard
          key={card.href}
          {...card}
          // A rail card needs an explicit width — a grid gives its children one,
          // a flex scroller does not, and without it every card collapses to
          // its content width and the rail stops looking like a rail.
          className="w-[15rem] shrink-0"
          sizes="240px"
        />
      ))}
    </Rail>
  );
}
