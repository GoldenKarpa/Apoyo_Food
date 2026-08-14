import type { Prisma, RegionKey } from "@prisma/client";

import { localDay, summarizeAvailability, weekdayBitmask, addDays } from "@/lib/availability";
import { followedSellerIds } from "@/lib/follows";
import { prisma } from "@/lib/prisma";
import { seenStoryIds } from "@/lib/stories";
import { publicSellerWhere } from "@/lib/visibility";

/**
 * Composed discovery sections — architecture Part E1.
 *
 * "Discovery = **composed sections over indexed queries** — no ML, no feed
 * engine; each home/browse section is a named, cacheable query. This is the
 * deliberately boring architecture that still demos spectacularly with good
 * photography."
 *
 * ⚠ **THE VISIBILITY RULE, and it is the one thing in this file that must never
 * be got wrong.** A listing is discoverable only when *all* of: the listing is
 * `active`, it has not been taken down, its seller is `ACTIVE`, **and the
 * seller's visibility class matches what the launch switch currently exposes**
 * (LC-4). The seed carries a deliberate trap for the seller-status half:
 * `mama-lin-kitchen` is SUSPENDED and still owns `active: true` listings, and
 * `pastelitos-y-mas` is PENDING with a live listing. A query that filters on
 * `active` alone returns both and leaks a suspended kitchen onto the storefront.
 * Every query in this module goes through `discoverable()`.
 */

/**
 * The only listing filter any buyer-facing query may start from.
 *
 * `takenDownAt: null` (Slice 16) is a SEPARATE gate from `active`: `active` is
 * the seller's own pause switch, `takenDownAt` is admin-authority removal, and
 * a listing must be hidden if EITHER is set.
 *
 * ⚠ **LC-4 (2026-08-14) turned this from a `const` into an async function, and
 * that was the point rather than a side effect.** It now folds in the
 * launch-switch class filter, which requires reading the switch over the
 * network. As a `const` it could be spread into a new query without thought; as
 * a function it cannot be used without `await`, so the compiler visits every
 * buyer-facing query and a new one cannot silently skip the gate. The plan's
 * own warning for this slice is "miss one and it leaks" — this makes missing
 * one a type error.
 *
 * ⚠ **Never merge a second `seller` key onto the result of this** (the Slice 9
 * finding, recorded in BUILD_SLICES: two `seller` keys in one object literal
 * silently overwrite each other, and the survivor would drop the visibility
 * filter). To add a seller condition, spread `(await discoverable()).seller`
 * into your own fully-authored `seller` clause — `followedSellersListings`
 * below is the worked example.
 */
export async function discoverable(): Promise<Prisma.FoodListingWhereInput> {
  return discoverableFromSeller({});
}

/**
 * `discoverable()`, with EXTRA conditions folded into its `seller` clause.
 *
 * ⚠ This exists so the two-`seller`-keys bug is unrepresentable rather than
 * merely warned about. Spreading `...(await discoverable())` and then adding
 * your own `seller: { … }` does not merge the two — the later key wins outright
 * and silently discards the status + visibility gate. That shipped once already
 * (see `mostSavedListings`). Use this instead whenever a buyer-facing query
 * needs to filter on something about the seller.
 */
export async function discoverableFromSeller(
  extra: Prisma.FoodSellerWhereInput,
): Promise<Prisma.FoodListingWhereInput> {
  return {
    active: true,
    takenDownAt: null,
    seller: { ...(await publicSellerWhere()), ...extra },
  };
}

/** Everything a `<MealCard>` needs, and nothing more. */
export const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  priceCents: true,
  priceMode: true,
  occasionTag: true,
  createdAt: true,
  photos: {
    select: { pathCard: true, blurDataUrl: true },
    orderBy: { sortOrder: "asc" as const },
    take: 1,
  },
  availabilityWindows: {
    select: {
      type: true,
      daysOfWeek: true,
      startsOn: true,
      endsOn: true,
      leadTimeDays: true,
      note: true,
    },
  },
  seller: {
    select: {
      slug: true,
      displayName: true,
      areas: true,
      profileImageThumb: true,
      profileImageBlur: true,
    },
  },
} satisfies Prisma.FoodListingSelect;

export type ListingCardRow = Prisma.FoodListingGetPayload<{ select: typeof CARD_SELECT }>;

/**
 * A listing row plus its computed availability, which is what the card actually
 * renders. Computed in Node **after** the database has already narrowed the set
 * — the DB does the filtering (see `availableOnWeekdayFilter`), this only
 * decides which stamp the surviving rows wear.
 */
export function withAvailability(rows: ListingCardRow[], now = new Date()) {
  return rows.map((row) => ({ ...row, availability: summarizeAvailability(row.availabilityWindows, now) }));
}

export type ListingCard = ReturnType<typeof withAvailability>[number];

/**
 * Listings recurring on a given weekday, **as a database filter**.
 *
 * ⚠ Deliberately not "load everything and filter in Node". That works at 50 seed
 * listings and silently stops working long before it fails visibly. Postgres
 * evaluates the bitmask; `daysOfWeek` is a plain integer column precisely so it
 * can.
 */
function availableOnWeekdayFilter(weekday: number): Prisma.FoodListingWhereInput {
  return {
    availabilityWindows: {
      some: {
        type: "RECURRING_WEEKLY",
        // Prisma has no bitwise operator, so the mask is expanded to the set of
        // integers that contain the bit. 128 values is a trivially indexable IN
        // list and keeps this inside the query planner rather than in Node.
        daysOfWeek: { in: masksContaining(weekday) },
      },
    },
  };
}

const MASK_CACHE = new Map<number, number[]>();
function masksContaining(weekday: number): number[] {
  const cached = MASK_CACHE.get(weekday);
  if (cached) return cached;
  const bit = weekdayBitmask(weekday);
  const values: number[] = [];
  for (let mask = 1; mask <= 127; mask += 1) if ((mask & bit) !== 0) values.push(mask);
  MASK_CACHE.set(weekday, values);
  return values;
}

// ---------------------------------------------------------------------------
// Part E1's home sections
// ---------------------------------------------------------------------------

/**
 * Section 1 — the Fresh Today rail (Part E1: "followed sellers first (unseen
 * first), then recently-active sellers").
 *
 * ⚠ Slice 11: re-sorted in Node, not in the query. The DB orders by recency,
 * over-fetching to `limit * 3` so a followed seller's older post isn't cut off
 * by the initial `createdAt` window before the followed/unseen re-sort even
 * runs — with only 13 active stories total in the seed this never actually
 * trims anything today, but it is the correct shape for when it does.
 */
export async function freshTodayEntries(limit = 12, userId: string | null = null) {
  const rows = await prisma.foodStory.findMany({
    where: {
      expiresAt: { gt: new Date() },
      seller: await publicSellerWhere(),
    },
    select: {
      id: true,
      caption: true,
      pathCard: true,
      blurDataUrl: true,
      createdAt: true,
      seller: { select: { id: true, slug: true, displayName: true } },
      linkedListing: { select: { slug: true, availabilityWindows: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit * 3,
  });

  if (!userId) return rows.slice(0, limit);

  const [followed, seen] = await Promise.all([
    followedSellerIds(userId),
    seenStoryIds(userId, rows.map((r) => r.id)),
  ]);

  const sorted = [...rows].sort((a, b) => {
    const aFollowed = followed.has(a.seller.id) ? 1 : 0;
    const bFollowed = followed.has(b.seller.id) ? 1 : 0;
    if (aFollowed !== bFollowed) return bFollowed - aFollowed;
    const aUnseen = seen.has(a.id) ? 0 : 1;
    const bUnseen = seen.has(b.id) ? 0 : 1;
    if (aUnseen !== bUnseen) return bUnseen - aUnseen;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return sorted.slice(0, limit);
}

/** Section 2 — available today / this weekend, computed from windows. */
export async function availableSoon(limit = 8, now = new Date()) {
  const today = localDay(now);
  // Saturday of the coming weekend, so "this weekend" means the same thing on a
  // Monday and on a Friday.
  const weekendOffset = (6 - today.weekday + 7) % 7;
  const saturday = addDays(today, weekendOffset);

  const rows = await prisma.foodListing.findMany({
    where: {
      ...(await discoverable()),
      OR: [availableOnWeekdayFilter(today.weekday), availableOnWeekdayFilter(saturday.weekday)],
    },
    select: CARD_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return withAvailability(rows, now);
}

/** Section 3 — browse by category. */
export async function categoryCards() {
  const listing = await discoverable();
  const categories = await prisma.foodCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameEs: true,
      seasonal: true,
      heroImage: true,
      _count: { select: { listings: { where: { listing } } } },
    },
  });
  // A category with nothing in it is a dead end on the demo's front page.
  return categories.filter((c) => c._count.listings > 0);
}

/** Section 4 — new this week. */
export async function newestListings(limit = 8, now = new Date()) {
  const rows = await prisma.foodListing.findMany({
    where: await discoverable(),
    select: CARD_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return withAvailability(rows, now);
}

/**
 * Section 5 — trending.
 *
 * Part E4 is explicit that Phase 1 uses a **recent-views proxy** and Phase 5
 * materialises a real `trendScore`. This reads the demand stream directly, which
 * is the honest version of the proxy: it is genuinely "what people looked at
 * lately", not a popularity number someone typed into a seed.
 */
export async function trendingListings(limit = 8, now = new Date()) {
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const grouped = await prisma.foodDemandEvent.groupBy({
    by: ["listingId"],
    where: { kind: { in: ["LISTING_VIEW", "SAVE"] }, createdAt: { gte: since }, listingId: { not: null } },
    _count: { listingId: true },
    orderBy: { _count: { listingId: "desc" } },
    take: limit * 3,
  });

  const ids = grouped.map((g) => g.listingId!).filter(Boolean);

  const rows =
    ids.length > 0
      ? await prisma.foodListing.findMany({
          where: { ...(await discoverable()), id: { in: ids } },
          select: CARD_SELECT,
          take: limit,
        })
      : [];

  // Restore the ranking the group-by produced — `findMany` does not preserve it.
  const rank = new Map(ids.map((id, index) => [id, index]));
  rows.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));

  // ⚠ **Top up, do not just fall back on empty.** A young event stream is the
  // normal state of this rail — a fresh demo database, or the first week in
  // production — and the first version only substituted saves when there were
  // *zero* events, so two view events produced a two-card "Trending now" rail
  // next to four full ones. That reads as broken rather than as honest. Caught
  // by looking at the rendered page, not by any assertion.
  if (rows.length < limit) {
    const filler = await mostSavedListings(limit * 2, now);
    const seen = new Set(rows.map((r) => r.id));
    for (const candidate of filler) {
      if (rows.length >= limit) break;
      if (seen.has(candidate.id)) continue;
      rows.push(candidate);
      seen.add(candidate.id);
    }
    return withAvailability(rows.slice(0, limit), now);
  }

  return withAvailability(rows, now);
}

/**
 * The trending fallback, and also "Popular in your area" (Part E4, Slice 10).
 *
 * ⚠ **Bug fixed here at LC-4 (2026-08-14), and it was live before this slice.**
 * This used to spread the old `DISCOVERABLE` const and then conditionally spread a SECOND
 * `seller` key for the area filter. Two `seller` keys in one object literal do
 * not merge — the later one wins outright — so whenever `area` was set, the
 * `takenDownAt`/seller-status half of the gate was silently discarded and a
 * suspended kitchen could surface in "Popular in your area". That is the exact
 * failure BUILD_SLICES already records from Slice 9, reintroduced here.
 *
 * It matters more now than it did: post-LC-4 the discarded clause also carries
 * the visibility class, so the same overwrite would have leaked pre-launch REAL
 * sellers onto a closed storefront. Fixed by authoring ONE `seller` clause that
 * folds the area condition into the gate rather than replacing it.
 */
export async function mostSavedListings(limit = 8, now = new Date(), area?: RegionKey | null) {
  const rows = await prisma.foodListing.findMany({
    where: await discoverableFromSeller(area ? { areas: { has: area } } : {}),
    select: { ...CARD_SELECT, _count: { select: { saves: true } } },
    orderBy: { saves: { _count: "desc" } },
    take: limit,
  });
  return withAvailability(rows, now);
}

/** Section 6 — sellers near you, from the area cookie. */
export async function sellersInArea(area: RegionKey | null, limit = 8) {
  return prisma.foodSeller.findMany({
    where: { ...(await publicSellerWhere()), ...(area ? { areas: { has: area } } : {}) },
    select: SELLER_CARD_SELECT,
    orderBy: [{ lastStoryAt: { sort: "desc", nulls: "last" } }, { followerCount: "desc" }],
    take: limit,
  });
}

/**
 * Section 7 — "from sellers you follow" (Part E1: "signed-in, following ≥1").
 *
 * Slice 9 deliberately left this section out of the home page entirely rather
 * than render an empty heading to every anonymous visitor — "Section 7 …is
 * deliberately absent. It needs a signed-in viewer with follows, and Slice 11
 * owns follows." This is that function; the home page only renders the
 * section when both a session exists AND this returns something.
 */
export async function followedSellersListings(userId: string, limit = 8, now = new Date()) {
  const rows = await prisma.foodListing.findMany({
    // Folds the follow condition INTO the gate's seller clause rather than
    // replacing it — see `discoverableFromSeller`.
    where: await discoverableFromSeller({ followers: { some: { userId } } }),
    select: CARD_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return withAvailability(rows, now);
}

export const SELLER_CARD_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  areas: true,
  specialties: true,
  followerCount: true,
  lastStoryAt: true,
  coverImageCard: true,
  coverImageBlur: true,
  profileImageThumb: true,
  profileImageBlur: true,
  _count: { select: { listings: { where: { active: true } } } },
} satisfies Prisma.FoodSellerSelect;

export type SellerCardRow = Prisma.FoodSellerGetPayload<{ select: typeof SELLER_CARD_SELECT }>;

/**
 * Section 8 — the seasonal rail, "auto-shown inside a configurable window around
 * each occasion" (Part E1).
 *
 * Shown only when a seasonal listing is genuinely in its window right now, so it
 * disappears on its own in February rather than needing a person to remember.
 */
export async function seasonalListings(limit = 8, now = new Date()) {
  const today = localDay(now);
  const todayDate = new Date(`${today.iso}T00:00:00.000Z`);
  const rows = await prisma.foodListing.findMany({
    where: {
      ...(await discoverable()),
      availabilityWindows: {
        some: { type: "DATE_RANGE", startsOn: { lte: todayDate }, endsOn: { gte: todayDate } },
      },
    },
    select: CARD_SELECT,
    take: limit,
  });
  return withAvailability(rows, now);
}

/**
 * `/meals/[slug]`'s "More from this seller" rail (Slice 10, Part E4 Phase 1).
 *
 * A scalar `sellerId` equality, not a second `seller` key merged onto
 * `discoverable()` — the Slice 9 finding about two `seller` keys silently
 * overwriting each other (and dropping the ACTIVE-status check) only applies
 * to nested relation filters, but the same instinct applies here: don't touch
 * how `discoverable()`'s own `seller` clause is shaped.
 */
export async function moreFromSeller(
  sellerId: string,
  excludeListingId: string,
  limit = 8,
  now = new Date(),
) {
  const rows = await prisma.foodListing.findMany({
    where: { ...(await discoverable()), sellerId, id: { not: excludeListingId } },
    select: CARD_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return withAvailability(rows, now);
}

/**
 * `/meals/[slug]`'s "Similar in {category}" rail (Slice 10, Part E4 Phase 1).
 *
 * Anchored on the listing's PRIMARY category only (the page picks
 * `categories[0]`, sorted by `FoodCategory.sortOrder`) — matching "Similar in
 * Desserts" with a candidate set that also pulls in Lunch because a dish
 * happens to carry both tags would read as wrong, not generous.
 */
export async function similarInCategory(
  categoryId: string,
  excludeListingId: string,
  limit = 8,
  now = new Date(),
) {
  const rows = await prisma.foodListing.findMany({
    where: {
      ...(await discoverable()),
      id: { not: excludeListingId },
      categories: { some: { categoryId } },
    },
    select: CARD_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return withAvailability(rows, now);
}

/**
 * How many publicly-visible sellers each area holds — the directory's area
 * counts. Gated: a count that includes sellers the directory itself will not
 * list reads as a broken filter ("North West (7)" opening onto three cards).
 */
export async function sellerCountsByArea(): Promise<Record<string, number>> {
  const sellers = await prisma.foodSeller.findMany({
    where: await publicSellerWhere(),
    select: { areas: true },
  });
  const counts: Record<string, number> = {};
  for (const seller of sellers) {
    for (const area of seller.areas) counts[area] = (counts[area] ?? 0) + 1;
  }
  return counts;
}
