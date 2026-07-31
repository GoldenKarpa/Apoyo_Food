import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ListingGrid } from "@/components/listing-grid";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { CARD_SELECT, DISCOVERABLE, withAvailability } from "@/lib/discovery";
import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.saved");
  return { title: t("title") };
}

/**
 * `/saved` (Slice 10, Part F1's sitemap: "Saves (Phase 4: collections)").
 *
 * ⚠ **No sign-in redirect for the anonymous case** — the same rule
 * `<SaveButton>` follows (see `lib/actions/save-listing.ts`'s header comment):
 * Food has no client login door yet, and the ecosystem's cross-vertical login
 * flow must never surface one vertical's URL to another's visitor. An inline
 * message is the whole of the signed-out state here.
 *
 * A saved row whose listing has since gone non-`DISCOVERABLE` (seller
 * suspended, listing deactivated) is filtered out here too, via the relation
 * filter — the same visibility rule every other buyer-facing query in this
 * app goes through (Slice 9), applied to the one query this slice adds that
 * reads `FoodListing` through a relation rather than directly.
 */
export default async function SavedPage() {
  const [t, session] = await Promise.all([getTranslations("client.saved"), getFoodSession()]);

  if (!session) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-card border border-hairline bg-card p-8">
        <h1 className="font-display text-h1 font-semibold text-ink">{t("signedOutTitle")}</h1>
        <p className="max-w-lg text-body text-ink-muted">{t("signedOutBody")}</p>
      </div>
    );
  }

  const rows = await prisma.foodSave.findMany({
    where: { userId: session.userId, listing: DISCOVERABLE },
    select: { listing: { select: CARD_SELECT } },
    orderBy: { createdAt: "desc" },
  });
  const listings = withAvailability(rows.map((r) => r.listing));

  return (
    <>
      <SectionHeader as="h1" title={t("title")} note={t("count", { count: listings.length })} />

      {listings.length > 0 ? (
        <ListingGrid listings={listings} priorityCount={4} session={session} />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-card border border-hairline bg-card p-8">
          <h2 className="font-display text-h1 font-semibold text-ink">{t("emptyTitle")}</h2>
          <p className="max-w-lg text-body text-ink-muted">{t("emptyBody")}</p>
          <Button asChild variant="outline">
            <Link href="/browse">{t("emptyAction")}</Link>
          </Button>
        </div>
      )}
    </>
  );
}
