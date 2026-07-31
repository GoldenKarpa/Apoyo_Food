import type { Prisma, RegionKey } from "@prisma/client";

import { localDay, addDays } from "@/lib/availability";
import { CARD_SELECT, DISCOVERABLE, withAvailability } from "@/lib/discovery";
import { prisma } from "@/lib/prisma";
import { isRegionKey } from "@/lib/regions";

/**
 * `/browse`'s filter state — parsed from and serialised back to **URL search
 * params**, because Part E1 requires it: "All server-rendered, filter state in
 * URL params (shareable links — organic marketing surface)."
 *
 * Parsing lives here rather than in the page so that `/categories/[slug]` and
 * `/search` can reuse the exact same semantics — three places deciding
 * independently what `price=under-50` means is how a filter starts disagreeing
 * with itself.
 */

export const SORT_OPTIONS = ["newest", "popular", "price-asc", "price-desc"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const PRICE_BANDS = {
  "under-50": { min: null, max: 4999 },
  "50-150": { min: 5000, max: 15000 },
  "150-300": { min: 15001, max: 30000 },
  "over-300": { min: 30001, max: null },
} as const;
export type PriceBand = keyof typeof PRICE_BANDS;

export const AVAILABILITY_FILTERS = ["today", "weekend", "preorder"] as const;
export type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number];

export const DIETARY_TAGS = ["vegetarian", "vegan", "gluten-free"] as const;

export interface BrowseFilters {
  categories: string[];
  areas: RegionKey[];
  price: PriceBand | null;
  dietary: string[];
  availability: AvailabilityFilter | null;
  sort: SortOption;
}

export const EMPTY_FILTERS: BrowseFilters = {
  categories: [],
  areas: [],
  price: null,
  dietary: [],
  availability: null,
  sort: "newest",
};

type ParamValue = string | string[] | undefined;

function list(value: ParamValue): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  // Comma-separated is the shareable-link form; repeated params also work.
  return raw.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

export function parseFilters(params: Record<string, ParamValue>): BrowseFilters {
  const price = list(params.price)[0];
  const availability = list(params.availability)[0];
  const sort = list(params.sort)[0];

  return {
    categories: list(params.category),
    areas: list(params.area).filter(isRegionKey),
    price: price && price in PRICE_BANDS ? (price as PriceBand) : null,
    dietary: list(params.dietary).filter((tag) => (DIETARY_TAGS as readonly string[]).includes(tag)),
    availability: (AVAILABILITY_FILTERS as readonly string[]).includes(availability ?? "")
      ? (availability as AvailabilityFilter)
      : null,
    sort: (SORT_OPTIONS as readonly string[]).includes(sort ?? "") ? (sort as SortOption) : "newest",
  };
}

/** Back to a query string — the shareable link, with defaults omitted. */
export function serializeFilters(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.categories.length) params.set("category", filters.categories.join(","));
  if (filters.areas.length) params.set("area", filters.areas.join(","));
  if (filters.price) params.set("price", filters.price);
  if (filters.dietary.length) params.set("dietary", filters.dietary.join(","));
  if (filters.availability) params.set("availability", filters.availability);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return params.toString();
}

export function activeFilterCount(filters: BrowseFilters): number {
  return (
    filters.categories.length +
    filters.areas.length +
    filters.dietary.length +
    (filters.price ? 1 : 0) +
    (filters.availability ? 1 : 0)
  );
}

/** Every mask value containing a given weekday bit — see lib/discovery.ts. */
function masksContaining(weekday: number): number[] {
  const bit = 1 << weekday;
  const values: number[] = [];
  for (let mask = 1; mask <= 127; mask += 1) if ((mask & bit) !== 0) values.push(mask);
  return values;
}

function availabilityWhere(
  filter: AvailabilityFilter,
  now: Date,
): Prisma.FoodListingWhereInput {
  const today = localDay(now);

  if (filter === "preorder") {
    return { availabilityWindows: { some: { type: "PREORDER" } } };
  }

  const weekdays =
    filter === "today"
      ? [today.weekday]
      : [addDays(today, (6 - today.weekday + 7) % 7).weekday, addDays(today, (7 - today.weekday) % 7).weekday];

  return {
    availabilityWindows: {
      some: {
        type: "RECURRING_WEEKLY",
        daysOfWeek: { in: [...new Set(weekdays.flatMap(masksContaining))] },
      },
    },
  };
}

export function buildWhere(filters: BrowseFilters, now = new Date()): Prisma.FoodListingWhereInput {
  const and: Prisma.FoodListingWhereInput[] = [DISCOVERABLE];

  if (filters.categories.length) {
    and.push({ categories: { some: { category: { slug: { in: filters.categories } } } } });
  }
  if (filters.areas.length) {
    // ⚠ Merged INTO the seller filter rather than added as a second `seller`
    // key: two `seller` keys in one object silently overwrite each other, and
    // the one that would have been dropped here is the ACTIVE-status check.
    and.push({ seller: { status: "ACTIVE", areas: { hasSome: filters.areas } } });
  }
  if (filters.price) {
    const band = PRICE_BANDS[filters.price];
    and.push({
      priceCents: {
        ...(band.min !== null ? { gte: band.min } : {}),
        ...(band.max !== null ? { lte: band.max } : {}),
      },
    });
  }
  if (filters.dietary.length) {
    and.push({ dietaryTags: { hasEvery: filters.dietary } });
  }
  if (filters.availability) {
    and.push(availabilityWhere(filters.availability, now));
  }

  return { AND: and };
}

function orderBy(sort: SortOption): Prisma.FoodListingOrderByWithRelationInput[] {
  switch (sort) {
    case "popular":
      return [{ saves: { _count: "desc" } }, { createdAt: "desc" }];
    case "price-asc":
      // ⚠ QUOTE listings have a NULL price and must not lead a price sort —
      // "cheapest first" showing four price-on-request cards is a bug that
      // looks like a design choice.
      return [{ priceCents: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
    case "price-desc":
      return [{ priceCents: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

export async function browseListings(
  filters: BrowseFilters,
  opts: { take?: number; skip?: number; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const where = buildWhere(filters, now);

  const [rows, total] = await Promise.all([
    prisma.foodListing.findMany({
      where,
      select: CARD_SELECT,
      orderBy: orderBy(filters.sort),
      take: opts.take ?? 24,
      skip: opts.skip ?? 0,
    }),
    prisma.foodListing.count({ where }),
  ]);

  return { listings: withAvailability(rows, now), total };
}
