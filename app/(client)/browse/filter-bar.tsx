"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { FilterSheet, type FilterSelection } from "@/components/filters/filter-sheet";
import { Chip } from "@/components/ui/chip";
import { getBrowseResultCount } from "@/lib/actions/browse-count";
import {
  AVAILABILITY_FILTERS,
  DIETARY_TAGS,
  PRICE_BANDS,
  SORT_OPTIONS,
  type AvailabilityFilter,
  type BrowseFilters,
  type PriceBand,
} from "@/lib/browse";
import type { RegionKey } from "@prisma/client";
import { REGION_KEYS } from "@/lib/regions";
import { cn } from "@/lib/utils";

/**
 * `/browse`'s filter controls.
 *
 * ⚠ **Filter state lives in the URL, not in this component** (Part E1:
 * "server-rendered, filter state in URL params — shareable links, organic
 * marketing surface"). So this holds no filter state of its own: it reads the
 * current params, and applying a change is a navigation. The consequences that
 * make this the right shape rather than a purist one — a filtered browse can be
 * pasted into WhatsApp, the back button undoes a filter, and the page is
 * server-rendered with real content for a crawler.
 *
 * `<FilterSheet>` (Slice 7) already holds the draft-until-Apply semantics, which
 * is what keeps this to **one** navigation per filter session rather than one
 * per pill tap — and that matters beyond snappiness, because every browse
 * navigation writes a demand event and per-tap events would turn one person's
 * indecision into a demand signal.
 */
export function FilterBar({ filters }: { filters: BrowseFilters }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("filters");
  const ta = useTranslations("availability");
  const ts = useTranslations("client.sections");
  const tsort = useTranslations("filters.sortOptions");
  const tprice = useTranslations("filters.priceBands");
  const tdiet = useTranslations("filters.dietaryTags");

  function navigate(next: URLSearchParams) {
    const query = next.toString();
    startTransition(() => router.push(query ? `/browse?${query}` : "/browse", { scroll: false }));
  }

  function applySelection(selection: FilterSelection) {
    const next = new URLSearchParams();
    // Sort is not part of the sheet — it has its own always-visible control —
    // so it is carried across rather than dropped.
    const sort = params.get("sort");
    if (sort) next.set("sort", sort);

    for (const [key, values] of Object.entries(selection)) {
      if (values.length > 0) next.set(key, values.join(","));
    }
    navigate(next);
  }

  function setSort(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "newest") next.delete("sort");
    else next.set("sort", value);
    navigate(next);
  }

  const groups = [
    {
      key: "category",
      label: t("groups.category"),
      mode: "multi" as const,
      options: CATEGORY_SLUGS.map((slug) => ({ value: slug, label: ts.raw(`categoryNames.${slug}`) as string })),
    },
    {
      key: "area",
      label: t("groups.area"),
      mode: "multi" as const,
      options: REGION_KEYS.map((key) => ({ value: key, label: ts.raw(`areaNames.${key}`) as string })),
    },
    {
      key: "price",
      label: t("groups.price"),
      mode: "single" as const,
      options: Object.keys(PRICE_BANDS).map((band) => ({ value: band, label: tprice(band) })),
    },
    {
      key: "dietary",
      label: t("groups.dietary"),
      mode: "multi" as const,
      options: DIETARY_TAGS.map((tag) => ({ value: tag, label: tdiet(tag) })),
    },
    {
      key: "availability",
      label: t("groups.availability"),
      mode: "single" as const,
      options: AVAILABILITY_FILTERS.map((value) => ({
        value,
        label: value === "preorder" ? ta("preorderShort") : ta(value),
      })),
    },
  ];

  const value: FilterSelection = {
    category: filters.categories,
    area: filters.areas,
    price: filters.price ? [filters.price] : [],
    dietary: filters.dietary,
    availability: filters.availability ? [filters.availability] : [],
  };

  // The sheet's own draft is a `FilterSelection` (group key -> string[]), not
  // a `BrowseFilters` — this is what lets `countResults` reuse the exact same
  // `buildWhere()` the page itself queries with, rather than a second,
  // possibly-drifting notion of what each group means.
  function countResults(selection: FilterSelection): Promise<number> {
    const price = selection.price?.[0];
    const availability = selection.availability?.[0];
    return getBrowseResultCount({
      categories: selection.category ?? [],
      areas: (selection.area ?? []) as RegionKey[],
      price: price && price in PRICE_BANDS ? (price as PriceBand) : null,
      dietary: selection.dietary ?? [],
      availability: (AVAILABILITY_FILTERS as readonly string[]).includes(availability ?? "")
        ? (availability as AvailabilityFilter)
        : null,
      sort: filters.sort,
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", isPending && "opacity-70")}>
      {/* Sort is a first-class control, not buried in the sheet — it is the one
          filter people change repeatedly while looking at results. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("groups.sort")}>
        {SORT_OPTIONS.map((option) => (
          <Chip
            key={option}
            asChild
            size="md"
            variant={filters.sort === option ? "selected" : "neutral"}
          >
            <button
              type="button"
              aria-pressed={filters.sort === option}
              onClick={() => setSort(option)}
            >
              {tsort(option)}
            </button>
          </Chip>
        ))}
      </div>

      {/* Right-aligned, matching Apparel's toolbar — the same control in the
          same corner on every browse surface. */}
      <FilterSheet groups={groups} value={value} onApply={applySelection} countFor={countResults} />
    </div>
  );
}

/**
 * The taxonomy slugs, mirrored from `prisma/seed.ts`.
 *
 * ⚠ Hard-coded on purpose: this is a **client** component, so it cannot query,
 * and threading twelve category names through props from every page that renders
 * a filter bar is worse. Slice 16's category manager makes the DB the authority
 * for what categories *exist*; when that lands, this list becomes a prop.
 */
const CATEGORY_SLUGS = [
  "breakfast",
  "lunch",
  "dinner",
  "snacks",
  "desserts",
  "baked-goods",
  "bbq-grill",
  "drinks",
  "juices-smoothies",
  "vegetarian-vegan",
  "catering",
  "holiday-specials",
] as const;
