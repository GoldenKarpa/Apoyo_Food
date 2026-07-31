import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ListingGrid } from "@/components/listing-grid";
import { SectionHeader } from "@/components/ui/section-header";
import { activeFilterCount, browseListings, parseFilters } from "@/lib/browse";
import { getFoodSession } from "@/lib/session";
import { FilterBar } from "./filter-bar";

export const metadata: Metadata = { title: "Browse" };

/**
 * `/browse` — the meals grid with filters (architecture Part E1's browse
 * perspectives, and Part F1's sitemap).
 *
 * Server-rendered from URL params, which is the whole design: a filtered browse
 * is a shareable link, the back button undoes a filter, and a crawler sees real
 * listings rather than an empty shell that fills in on the client.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const [t, { listings, total }, session] = await Promise.all([
    getTranslations("client.browse"),
    browseListings(filters, { take: 48 }),
    getFoodSession(),
  ]);

  const filterCount = activeFilterCount(filters);

  return (
    <>
      <SectionHeader
        as="h1"
        title={t("title")}
        note={filterCount > 0 ? t("resultsFiltered", { count: total }) : t("results", { count: total })}
      />

      <FilterBar filters={filters} />

      {listings.length > 0 ? (
        <ListingGrid listings={listings} priorityCount={4} session={session} />
      ) : (
        /* The empty state is a designed surface, not an oversight — Part E3
           calls a zero-result browse "unmet demand", and Phase 8's requests
           board is the eventual answer to it. */
        <div className="flex flex-col items-start gap-3 rounded-card border border-hairline bg-card p-8">
          <h2 className="font-display text-h1 font-semibold text-ink">{t("emptyTitle")}</h2>
          <p className="max-w-lg text-body text-ink-muted">{t("emptyBody")}</p>
        </div>
      )}
    </>
  );
}
