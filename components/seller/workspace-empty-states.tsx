import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Camera, ChefHat, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The dashboard's three next-action cards — listings, Fresh Today, orders.
 *
 * ⚠ Each one names a NEXT ACTION rather than describing an absence ("You have
 * no listings" is a status line; "Add your first dish" is a workspace). That is
 * the slice brief's own wording, and it is the whole difference between a
 * dashboard that reads as unfinished and one that reads as new.
 *
 * ── Slice 14 made listings real; Slice 15 made Fresh Today real too; Slice 17
 *    makes Orders the third and last ──
 * All three now branch on a real count instead of rendering a hardcoded
 * `<ComingSoon>` stub. `activeStoryCount` counts only NON-EXPIRED posts
 * (`expiresAt > now`) on purpose: a seller who posted yesterday and let
 * everything expire should see the empty-state copy again, not a stale
 * "manage your post" pointing at nothing currently live. `pendingOrderCount`
 * is PENDING orders specifically, not the seller's total order count — the
 * card's whole job is to say what needs THIS seller's attention right now,
 * and an order already accepted/completed/declined needs no action from here.
 */
export async function WorkspaceEmptyStates({
  listingCount,
  activeStoryCount,
  pendingOrderCount,
}: {
  listingCount: number;
  activeStoryCount: number;
  pendingOrderCount: number;
}) {
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

      <article className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-green-soft text-ink">
          <Camera aria-hidden className="size-5" />
        </span>
        <h3 className="font-display text-h3 font-semibold text-ink">
          {activeStoryCount > 0 ? t("stories.titleWithCount", { count: activeStoryCount }) : t("stories.title")}
        </h3>
        <p className="text-label text-ink">{activeStoryCount > 0 ? t("stories.bodyWithCount") : t("stories.body")}</p>
        <div className="mt-auto pt-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/food/stories">{activeStoryCount > 0 ? t("stories.manage") : t("stories.add")}</Link>
          </Button>
        </div>
      </article>

      <article className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-green-soft text-ink">
          <Receipt aria-hidden className="size-5" />
        </span>
        <h3 className="font-display text-h3 font-semibold text-ink">
          {pendingOrderCount > 0 ? t("orders.titleWithCount", { count: pendingOrderCount }) : t("orders.title")}
        </h3>
        <p className="text-label text-ink">{pendingOrderCount > 0 ? t("orders.bodyWithCount") : t("orders.body")}</p>
        <div className="mt-auto pt-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/food/orders">{pendingOrderCount > 0 ? t("orders.review") : t("orders.view")}</Link>
          </Button>
        </div>
      </article>
    </section>
  );
}
