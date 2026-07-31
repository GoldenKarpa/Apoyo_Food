import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";
import { DISCOVERABLE } from "@/lib/discovery";
import { logDemand } from "@/lib/demand";
import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";

/**
 * Slice 10 builds the real listing detail. What lands here at Slice 9 is the
 * half that must not wait: **the LISTING_VIEW demand event**.
 *
 * Part C is explicit that demand logging starts when browse ships, not when the
 * insights UI does — "events are cheap to log and expensive to backfill
 * (impossible, actually)". Every card on the site already links here, so this is
 * where the signal exists to be captured, and deferring it to Slice 10 would
 * throw away a slice's worth of history for nothing.
 *
 * ⚠ It also enforces the visibility rule at the *detail* level: a suspended
 * seller's listing is reachable by direct URL even when it appears in no listing
 * query, so this 404s rather than rendering it. The seed's SUSPENDED seller is
 * the test case, and `verify-discovery.ts` asserts it.
 */
export default async function MealDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [t, { slug }] = await Promise.all([getTranslations("client.meal"), params]);

  const listing = await prisma.foodListing.findFirst({
    where: { slug, ...DISCOVERABLE },
    select: { id: true, title: true, sellerId: true },
  });
  if (!listing) notFound();

  const session = await getFoodSession();
  logDemand({
    kind: "LISTING_VIEW",
    listingId: listing.id,
    sellerId: listing.sellerId,
    userId: session?.userId ?? null,
  });

  return <PlaceholderPage title={listing.title} body={t("body")} />;
}
