import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Camera, ChefHat, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ComingSoon } from "@/components/coming-soon";
import type { ComingSoonFeature } from "@/lib/coming-soon";

/**
 * The dashboard's three next-action cards — listings, Fresh Today, orders.
 *
 * ⚠ Each one names a NEXT ACTION rather than describing an absence ("You have
 * no listings" is a status line; "Add your first dish" is a workspace). That is
 * the slice brief's own wording, and it is the whole difference between a
 * dashboard that reads as unfinished and one that reads as new.
 *
 * ── Slice 14: the listings card became real ──
 * It is the first of these three that is genuinely data-driven rather than a
 * hardcoded `<ComingSoon>` stub: `listingCount` is a real count of this
 * seller's `FoodListing` rows, and the card branches on it — "add your first
 * dish" at zero, "manage your N dishes" once there's at least one. Fresh
 * Today and Orders stay stubs (Slices 15/17 build them), and their counts stay
 * hardcoded zero on purpose — those tables have no writer yet, so querying
 * them would be a round trip to confirm a constant.
 */
const STUB_CARDS: { key: string; feature: ComingSoonFeature; icon: typeof Camera }[] = [
  { key: "stories", feature: "sellerStories", icon: Camera },
  { key: "orders", feature: "sellerOrders", icon: Receipt },
];

export async function WorkspaceEmptyStates({ listingCount }: { listingCount: number }) {
  const t = await getTranslations("seller.emptyStates");

  return (
    <section className="grid gap-4 md:grid-cols-3">
      <article className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-green-soft text-ink">
          <ChefHat aria-hidden className="size-5" />
        </span>
        <h3 className="font-display text-h3 font-semibold text-ink">
          {listingCount > 0 ? t("listings.titleWithCount", { count: listingCount }) : t("listings.title")}
        </h3>
        <p className="text-label text-ink">{listingCount > 0 ? t("listings.bodyWithCount") : t("listings.body")}</p>
        <div className="mt-auto pt-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href={listingCount > 0 ? "/food/listings" : "/food/listings/new"}>
              {listingCount > 0 ? t("listings.manage") : t("listings.add")}
            </Link>
          </Button>
        </div>
      </article>

      {STUB_CARDS.map(({ key, feature, icon: Icon }) => (
        <article key={key} className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-green-soft text-ink">
            <Icon aria-hidden className="size-5" />
          </span>
          <h3 className="font-display text-h3 font-semibold text-ink">{t(`${key}.title`)}</h3>
          <p className="text-label text-ink">{t(`${key}.body`)}</p>
          <div className="mt-auto pt-2">
            <ComingSoon feature={feature} variant="secondary" size="sm" />
          </div>
        </article>
      ))}
    </section>
  );
}
