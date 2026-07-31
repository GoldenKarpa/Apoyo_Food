import { CARD_SELECT, SELLER_CARD_SELECT, withAvailability } from "@/lib/discovery";
import { prisma } from "@/lib/prisma";

/**
 * Search — architecture Part E3.
 *
 * "Postgres-native, no external engine (avoid overengineering — right-sized for
 * a single-island marketplace)." Phase 1 ships title/tag/seller matching;
 * Phase 5 adds trigram indexes, typo tolerance and search-as-you-type.
 *
 * ── Why `unaccent` and not `ILIKE` alone ──
 * The catalogue is deliberately bilingual and the accents are real: a cook
 * authors *Pastelón de plátano*, and an English-speaking buyer types "pastelon".
 * A plain `ILIKE '%pastelon%'` misses it. Part E3 chose `unaccent` + `pg_trgm`
 * over language-specific stemming precisely because bilingual content makes
 * stemming configs unreliable — and because it handles Trinidad spelling
 * variance ("pelau/pilau", "geera/jeera") as a side effect.
 *
 * ⚠ **`unaccent()` is applied to BOTH sides** — the stored text and the query.
 * Applying it to only one is the classic version of this bug and it fails
 * asymmetrically: searching "pastelon" finds the dish, searching "pastelón"
 * does not, so the Spanish-speaking user the feature exists for is the one it
 * fails. Both extensions were proven working at Slice 2.
 *
 * ── Raw SQL, deliberately ──
 * Prisma has no `unaccent` and no `similarity`. `$queryRaw` returns ids only and
 * every id is then re-fetched through the normal typed selects, so exactly one
 * hand-written statement exists in the app and nothing downstream loses type
 * safety. All interpolation is parameterised (Part G: "Prisma (parameterized)
 * throughout").
 */

/** Trigram similarity floor — Part E3's own worked example uses 0.3. */
const SIMILARITY_FLOOR = 0.3;

export interface SearchResults {
  listings: Awaited<ReturnType<typeof withAvailability>>;
  sellers: Awaited<ReturnType<typeof searchSellers>>;
  /** Total across both tabs — this is what a SEARCH demand event records. */
  total: number;
}

async function searchListingIds(query: string, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT l.id,
           GREATEST(
             similarity(unaccent(l.title), unaccent(${query})),
             similarity(unaccent(s.display_name), unaccent(${query}))
           ) AS score
      FROM food_listings l
      JOIN food_sellers s ON s.id = l.seller_id
     WHERE l.active = true
       AND s.status = 'ACTIVE'
       AND (
              unaccent(l.title)        ILIKE '%' || unaccent(${query}) || '%'
           OR unaccent(l.description)  ILIKE '%' || unaccent(${query}) || '%'
           OR unaccent(s.display_name) ILIKE '%' || unaccent(${query}) || '%'
           OR EXISTS (
                SELECT 1 FROM unnest(l.ingredient_tags) AS tag
                 WHERE unaccent(tag) ILIKE '%' || unaccent(${query}) || '%'
              )
           -- Trigram similarity catches the spelling variance ILIKE cannot:
           -- "pelau"/"pilau", "geera"/"jeera". Part E3's stated reason for
           -- choosing trigrams over stemming.
           OR similarity(unaccent(l.title), unaccent(${query})) > ${SIMILARITY_FLOOR}
           )
     ORDER BY score DESC, l.created_at DESC
     LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

async function searchSellerIds(query: string, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id,
           similarity(unaccent(s.display_name), unaccent(${query})) AS score
      FROM food_sellers s
     WHERE s.status = 'ACTIVE'
       AND (
              unaccent(s.display_name) ILIKE '%' || unaccent(${query}) || '%'
           OR unaccent(COALESCE(s.bio, '')) ILIKE '%' || unaccent(${query}) || '%'
           OR EXISTS (
                SELECT 1 FROM unnest(s.specialties) AS spec
                 WHERE unaccent(spec) ILIKE '%' || unaccent(${query}) || '%'
              )
           OR similarity(unaccent(s.display_name), unaccent(${query})) > ${SIMILARITY_FLOOR}
           )
     ORDER BY score DESC, s.follower_count DESC
     LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

async function searchSellers(query: string, limit: number) {
  const ids = await searchSellerIds(query, limit);
  if (ids.length === 0) return [];
  const rows = await prisma.foodSeller.findMany({
    where: { id: { in: ids } },
    select: SELLER_CARD_SELECT,
  });
  const rank = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}

export async function search(
  rawQuery: string,
  opts: { limit?: number; now?: Date } = {},
): Promise<SearchResults> {
  const query = rawQuery.trim();
  const limit = opts.limit ?? 24;

  if (query.length === 0) {
    return { listings: [], sellers: [], total: 0 };
  }

  const [listingIds, sellers] = await Promise.all([
    searchListingIds(query, limit),
    searchSellers(query, 8),
  ]);

  let listings: SearchResults["listings"] = [];
  if (listingIds.length > 0) {
    const rows = await prisma.foodListing.findMany({
      where: { id: { in: listingIds } },
      select: CARD_SELECT,
    });
    const rank = new Map(listingIds.map((id, index) => [id, index]));
    rows.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    listings = withAvailability(rows, opts.now);
  }

  return { listings, sellers, total: listings.length + sellers.length };
}
