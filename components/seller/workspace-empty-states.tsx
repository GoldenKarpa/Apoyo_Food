import { getTranslations } from "next-intl/server";
import { Camera, ChefHat, Receipt } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import type { ComingSoonFeature } from "@/lib/coming-soon";

/**
 * The dashboard's three empty states — listings, Fresh Today, orders.
 *
 * ⚠ Each one names a NEXT ACTION rather than describing an absence ("You have
 * no listings" is a status line; "Add your first dish" is a workspace). That is
 * the slice brief's own wording, and it is the whole difference between a
 * dashboard that reads as unfinished and one that reads as new.
 *
 * All three actions are `<ComingSoon>` stubs today — Slices 14, 15 and 17 build
 * them — so each card is honest about *when* rather than pretending the button
 * works. The counts are hardcoded zero on purpose: `FoodListing`, `FoodStory`
 * and `FoodOrder` all exist in the schema and a real seller genuinely has none
 * of any of them until those slices ship, so querying for them would be three
 * round trips to learn a constant.
 */
const CARDS: { key: string; feature: ComingSoonFeature; icon: typeof ChefHat }[] = [
  { key: "listings", feature: "sellerListings", icon: ChefHat },
  { key: "stories", feature: "sellerStories", icon: Camera },
  { key: "orders", feature: "sellerOrders", icon: Receipt },
];

export async function WorkspaceEmptyStates() {
  const t = await getTranslations("seller.emptyStates");

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {CARDS.map(({ key, feature, icon: Icon }) => (
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
