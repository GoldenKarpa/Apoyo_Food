import { getTranslations } from "next-intl/server";

import { FreshTodayCard } from "@/components/fresh-today-card";
import { Rail } from "@/components/ui/rail";
import { SectionHeader } from "@/components/ui/section-header";
import { summarizeAvailability } from "@/lib/availability";
import type { freshTodayEntries } from "@/lib/discovery";

/**
 * `<FreshTodayRail>` — the home board, "En la cocina hoy" (architecture Part
 * E2). The component name is mandated there: `<FreshTodayRail>` /
 * `<FreshTodayCard>` / `<FreshTodayViewer>` / `<MenuShelf>`, never
 * `StoryBar`/`StoryRing`, even though the Prisma models stay `FoodStory*`.
 *
 * Composed from Slice 7's generic `<Rail>` plus `<FreshTodayCard>` rather than
 * being its own scroller, so every rail on the site shares one set of snap,
 * full-bleed and keyboard behaviours.
 *
 * ── What the card says, and why ──
 * Part E2: the card must convey *what's fresh right now*, not merely *that
 * someone posted*. So the window label comes from the **linked listing's**
 * availability where there is one — a post linked to a dish that recurs on
 * weekends says "Fin de semana", not "posted 2 hours ago". Where there is no
 * linked listing it falls back to the posting time, which is the only honest
 * thing left to say.
 *
 * Seen/unseen is a **card border**, never a ring (Part E2). Slice 11 supplies
 * the real state from `FoodStoryView`; until then everything renders unseen,
 * which is correct for an anonymous visitor who has genuinely seen none of it.
 */
export async function FreshTodayRail({
  entries,
  seenIds = new Set<string>(),
}: {
  entries: Awaited<ReturnType<typeof freshTodayEntries>>;
  seenIds?: Set<string>;
}) {
  const [t, ta, tc] = await Promise.all([
    getTranslations("client.sections"),
    getTranslations("availability"),
    getTranslations("common"),
  ]);

  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      {/* The handwritten accent, used exactly as Part F3 permits: an occasional
          section label. `<SectionHeader script>` is the only door to it. */}
      <SectionHeader title={tc("freshToday")} script note={t("freshTodayNote")} />
      <Rail label={tc("freshToday")}>
        {entries.map((entry) => {
          const windows = entry.linkedListing?.availabilityWindows ?? [];
          const summary = windows.length > 0 ? summarizeAvailability(windows) : null;
          const label = summary
            ? ta(summary.labelKey, summary.labelValues)
            : t("postedToday");

          return (
            <FreshTodayCard
              key={entry.id}
              // Slice 11 builds the full-screen viewer at this route; until
              // then the link resolves to the seller's profile stub, which is
              // a real page rather than a dead href.
              href={`/sellers/${entry.seller.slug}`}
              sellerName={entry.seller.displayName}
              photo={{ src: entry.pathCard, blurDataUrl: entry.blurDataUrl }}
              photoAlt={entry.caption ?? entry.seller.displayName}
              windowLabel={label}
              seen={seenIds.has(entry.id)}
              freshLabel={t("freshDot")}
            />
          );
        })}
      </Rail>
    </section>
  );
}
