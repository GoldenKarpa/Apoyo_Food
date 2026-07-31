import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { ListingGrid } from "@/components/listing-grid";
import { CategoryChip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { browseListings, parseFilters } from "@/lib/browse";
import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [locale, category] = await Promise.all([
    getLocale(),
    prisma.foodCategory.findUnique({ where: { slug }, select: { nameEn: true, nameEs: true } }),
  ]);
  return { title: category ? (locale === "es" ? category.nameEs : category.nameEn) : "Category" };
}

/**
 * `/categories/[slug]` — the category landing (Part E1's "category landing
 * pages", Part F1's sitemap).
 *
 * ⚠ It is a **`/browse` view, not a second implementation.** The same
 * `parseFilters` / `browseListings` pair runs, with the slug forced into the
 * category filter — so a category page and the equivalent `/browse?category=…`
 * cannot drift into ranking or filtering differently. The only thing this route
 * adds is the landing chrome and the ability to layer further filters on top.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const category = await prisma.foodCategory.findUnique({ where: { slug } });
  if (!category) notFound();

  // The slug always wins over anything in the URL — this route IS the filter.
  const filters = { ...parseFilters(query), categories: [slug] };

  const [locale, t, { listings, total }, session] = await Promise.all([
    getLocale(),
    getTranslations("client.category"),
    browseListings(filters, { take: 48 }),
    getFoodSession(),
  ]);

  const name = locale === "es" ? category.nameEs : category.nameEn;

  return (
    <>
      <div className="flex flex-col gap-3">
        <CategoryChip asStatic category={category} label={name} />
        <SectionHeader as="h1" title={name} note={t("results", { count: total })} />
      </div>

      {listings.length > 0 ? (
        <ListingGrid listings={listings} priorityCount={4} session={session} />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-card border border-hairline bg-card p-8">
          <h2 className="font-display text-h1 font-semibold text-ink">{t("emptyTitle")}</h2>
          <p className="max-w-lg text-body text-ink-muted">{t("emptyBody")}</p>
        </div>
      )}
    </>
  );
}
