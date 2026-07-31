import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { RegionKey } from "@prisma/client";

import { ListingGrid } from "@/components/listing-grid";
import { SellerCard } from "@/components/seller-card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { logDemand } from "@/lib/demand";
import { search } from "@/lib/search";
import { AREA_COOKIE, isRegionKey } from "@/lib/regions";
import { getFoodSession } from "@/lib/session";
import { SearchForm } from "./search-form";

export const metadata: Metadata = { title: "Search" };

/**
 * `/search` — meals and sellers (architecture Part E3, Part F1's sitemap).
 *
 * ⚠ **THE ZERO-RESULT CASE IS THE POINT, not an edge case.** Part E3: "every
 * search logs a `FoodDemandEvent(SEARCH)` with normalized query + result count +
 * area — **zero-result searches are the single most valuable signal in the
 * system** (they are literally 'unmet demand near you', the Phase-6 insights
 * headline)". So the event is logged on every non-empty query *including* the
 * ones that find nothing, with `resultCount: 0` rather than by skipping the
 * write.
 *
 * The write is **fire-and-forget** (`logDemand`, never awaited): a search page
 * that stalls or 500s because an analytics insert was slow is a broken
 * storefront, and this is telemetry.
 *
 * The area comes from the same `food_area` cookie the home rail reads, so
 * "searched near you" is answerable in Phase 6 without ever asking twice.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.q === "string" ? params.q : Array.isArray(params.q) ? params.q[0] : "";
  const query = (raw ?? "").trim();

  const [t, ts, cookieStore, session] = await Promise.all([
    getTranslations("client.search"),
    getTranslations("client.sections"),
    cookies(),
    getFoodSession(),
  ]);

  const areaCookie = cookieStore.get(AREA_COOKIE)?.value;
  const area: RegionKey | null = isRegionKey(areaCookie) ? areaCookie : null;

  const results = query ? await search(query) : { listings: [], sellers: [], total: 0 };

  if (query) {
    logDemand({
      kind: "SEARCH",
      query,
      resultCount: results.total,
      area,
      userId: session?.userId ?? null,
    });
  }

  return (
    <>
      <SectionHeader as="h1" title={t("title")} />
      <SearchForm initialQuery={query} />

      {!query && <p className="text-body text-ink-muted">{t("prompt")}</p>}

      {query && results.total === 0 && (
        /* Part E3's designed empty state. It offers a way forward rather than
           an apology — Phase 8's requests board is the eventual answer, and
           until then browsing everything is the honest next step. */
        <div className="flex flex-col items-start gap-4 rounded-card border border-hairline bg-card p-8">
          <h2 className="font-display text-h1 font-semibold text-ink">
            {t("emptyTitle", { query })}
          </h2>
          <p className="max-w-lg text-body text-ink-muted">{t("emptyBody")}</p>
          <Button asChild variant="outline">
            <Link href="/browse">{t("emptyAction")}</Link>
          </Button>
        </div>
      )}

      {results.listings.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title={t("meals", { count: results.listings.length })} />
          <ListingGrid listings={results.listings} priorityCount={4} />
        </section>
      )}

      {results.sellers.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title={t("sellersTab", { count: results.sellers.length })} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.sellers.map((seller) => (
              <SellerCard
                key={seller.slug}
                href={`/sellers/${seller.slug}`}
                name={seller.displayName}
                areas={seller.areas.map((a) => ts.raw(`areaNames.${a}`) as string)}
                specialties={seller.specialties.slice(0, 2)}
                cover={
                  seller.coverImageCard
                    ? { src: seller.coverImageCard, blurDataUrl: seller.coverImageBlur }
                    : null
                }
                avatar={
                  seller.profileImageThumb
                    ? { src: seller.profileImageThumb, blurDataUrl: seller.profileImageBlur }
                    : null
                }
                followerLabel={ts("followers", { count: seller.followerCount })}
                hasFreshToday={seller.lastStoryAt !== null}
                freshTodayLabel={ts("freshDot")}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
