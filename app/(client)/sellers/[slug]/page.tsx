import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";
import { logDemand } from "@/lib/demand";
import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";

/**
 * Slice 11 builds the real seller profile. Slice 9 lands the **PROFILE_VIEW**
 * demand event here for the same reason `/meals/[slug]` lands LISTING_VIEW:
 * every seller card on the site already links here, and demand history cannot
 * be backfilled (Part C).
 *
 * ⚠ Only ACTIVE sellers resolve. A PENDING or SUSPENDED seller's profile is
 * reachable by direct URL even when it appears in no directory query, so this
 * 404s rather than rendering it — the seed's two non-ACTIVE sellers are the
 * test cases, and `verify-discovery.ts` asserts both.
 */
export default async function SellerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const [t, { slug }] = await Promise.all([getTranslations("client.sellerProfile"), params]);

  const seller = await prisma.foodSeller.findFirst({
    where: { slug, status: "ACTIVE" },
    select: { id: true, displayName: true },
  });
  if (!seller) notFound();

  const session = await getFoodSession();
  logDemand({ kind: "PROFILE_VIEW", sellerId: seller.id, userId: session?.userId ?? null });

  return <PlaceholderPage title={seller.displayName} body={t("body")} />;
}
