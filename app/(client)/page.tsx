import Link from "next/link";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import type { RegionKey } from "@prisma/client";

import { CategoryCard } from "@/components/category-card";
import { FreshTodayRail } from "@/components/fresh-today-rail";
import { ListingRail } from "@/components/listing-grid";
import { SellerCard } from "@/components/seller-card";
import { Button } from "@/components/ui/button";
import { Rail } from "@/components/ui/rail";
import { SectionHeader } from "@/components/ui/section-header";
import {
  availableSoon,
  categoryCards,
  followedSellersListings,
  freshTodayEntries,
  newestListings,
  seasonalListings,
  sellersInArea,
  trendingListings,
} from "@/lib/discovery";
import { getProviderRegistrationConfig } from "@/lib/ecosystem";
import { sellerSurfaceUrl } from "@/lib/links";
import { AREA_COOKIE, isRegionKey } from "@/lib/regions";
import { getFoodSession } from "@/lib/session";
import { seenStoryIds } from "@/lib/stories";

/**
 * Home — architecture Part E1's composed sections, in its own order.
 *
 * 1 Fresh Today rail · 2 available this weekend/today · 3 browse by category ·
 * 4 new this week · 5 trending · 6 sellers near you · 7 from sellers you
 * follow · 8 seasonal.
 *
 * Section 7 goes live in Slice 11: signed-in AND following ≥1, exactly as
 * Part E1 asks. Slice 9 deliberately left it out entirely rather than render
 * an empty heading to every anonymous visitor — same reasoning, applied here
 * to "following nobody yet" for a signed-in viewer too.
 *
 * ── Why every section is its own await, fired together ──
 * Part E1's whole point is that each section is "a named, cacheable query" — so
 * they are independent, and issuing them sequentially would make the page as
 * slow as the sum of seven round trips for no reason. `Promise.all` is what
 * makes the deliberately-boring architecture also fast.
 *
 * ⚠ Every one of these queries goes through `DISCOVERABLE` in `lib/discovery.ts`,
 * which filters on the **seller's** standing as well as the listing's. The seed
 * carries a SUSPENDED seller with live listings specifically so that a
 * regression here is caught rather than shipped.
 */
export default async function HomePage() {
  const cookieStore = await cookies();
  const areaCookie = cookieStore.get(AREA_COOKIE)?.value;
  const area: RegionKey | null = isRegionKey(areaCookie) ? areaCookie : null;

  const session = await getFoodSession();

  const [locale, t, ts, fresh, soon, categories, newest, trending, nearby, seasonal, following, registrationConfig] =
    await Promise.all([
      getLocale(),
      getTranslations("client.home"),
      getTranslations("client.sections"),
      freshTodayEntries(12, session?.userId ?? null),
      availableSoon(),
      categoryCards(),
      newestListings(),
      trendingListings(),
      sellersInArea(area),
      seasonalListings(),
      session ? followedSellersListings(session.userId) : Promise.resolve([]),
      getProviderRegistrationConfig(),
    ]);

  const seenIds = session ? await seenStoryIds(session.userId, fresh.map((entry) => entry.id)) : new Set<string>();

  return (
    <>
      <section className="flex flex-col gap-4">
        <h1 className="text-display font-semibold">{t("title")}</h1>
        <p className="max-w-2xl text-body text-ink-muted">{t("intro")}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/browse">{t("browse")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/browse/sellers">{t("browseSellers")}</Link>
          </Button>
          {/* Gated on the same FOOD toggle the footer CTA reads (§6b, CTA
              visibility only — see lib/ecosystem.ts) so the landing page never
              advertises a registration flow that's currently closed. */}
          {registrationConfig.FOOD && (
            <Button asChild size="lg" variant="outline">
              {/* Cross-origin in production; relative in local dev. */}
              <a href={sellerSurfaceUrl("/food/onboarding")}>{t("sell")}</a>
            </Button>
          )}
        </div>
      </section>

      {/* 1 — Fresh Today */}
      <FreshTodayRail entries={fresh} seenIds={seenIds} />

      {/* 8 — Seasonal, shown only while an occasion window is genuinely open,
          so it disappears on its own in February. */}
      {seasonal.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title={ts("seasonal")} note={ts("seasonalNote")} />
          <ListingRail listings={seasonal} label={ts("seasonal")} session={session} />
        </section>
      )}

      {/* 2 — Available today / this weekend */}
      {soon.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title={ts("availableSoon")}
            note={ts("availableSoonNote")}
            action={{ href: "/browse?availability=today", label: ts("seeAll") }}
          />
          <ListingRail listings={soon} label={ts("availableSoon")} session={session} />
        </section>
      )}

      {/* 3 — Browse by category */}
      {categories.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title={ts("categories")} />
          <Rail label={ts("categories")}>
            {categories.map((category) => (
              <CategoryCard
                key={category.slug}
                href={`/categories/${category.slug}`}
                name={locale === "es" ? category.nameEs : category.nameEn}
                category={category}
                hero={category.heroImage ? { src: category.heroImage, blurDataUrl: null } : null}
                countLabel={ts("mealCount", { count: category._count.listings })}
                className="w-[13rem] shrink-0"
                sizes="208px"
              />
            ))}
          </Rail>
        </section>
      )}

      {/* 4 — New this week */}
      {newest.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title={ts("newest")}
            action={{ href: "/browse?sort=newest", label: ts("seeAll") }}
          />
          <ListingRail listings={newest} label={ts("newest")} session={session} />
        </section>
      )}

      {/* 5 — Trending (Part E4: a recent-views proxy in Phase 1) */}
      {trending.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title={ts("trending")}
            note={ts("trendingNote")}
            action={{ href: "/browse?sort=popular", label: ts("seeAll") }}
          />
          <ListingRail listings={trending} label={ts("trending")} session={session} />
        </section>
      )}

      {/* 6 — Sellers near you */}
      {nearby.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title={area ? ts("nearYouIn", { area: ts.raw(`areaNames.${area}`) as string }) : ts("sellers")}
            note={ts("nearYouNote")}
            action={{ href: "/browse/sellers", label: ts("seeAll") }}
          />
          <Rail label={ts("sellers")}>
            {nearby.map((seller) => (
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
                className="w-[19rem] shrink-0"
              />
            ))}
          </Rail>
        </section>
      )}

      {/* 7 — From sellers you follow */}
      {following.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title={ts("following")} />
          <ListingRail listings={following} label={ts("following")} session={session} />
        </section>
      )}
    </>
  );
}
