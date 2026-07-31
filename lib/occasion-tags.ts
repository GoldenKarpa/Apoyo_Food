/**
 * `FoodListing.occasionTag` (Slice 10, Part D) is a plain, ADMIN-free-text
 * `String?` column — not an enum — but the demo seed only ever writes three
 * values (`christmas`, `birthday`, `divali`, per `prisma/seed-data/catalog.ts`).
 *
 * `messages/{en,es}.json`'s `occasionTags` namespace only carries translations
 * for that known set. This module is the one safe way to read it: a
 * translation lookup on an unknown tag would either throw or render the raw
 * key path (`occasionTags.foo`) in front of a demo audience, so an unknown tag
 * falls back to rendering itself rather than a broken-looking string — the
 * same "unknown resolves gracefully" instinct `lib/category-accent.ts` already
 * applies to an unrecognised category slug.
 */
const KNOWN_OCCASION_TAGS = ["christmas", "birthday", "divali"] as const;

export function occasionLabel(tag: string, t: (key: string) => string): string {
  return (KNOWN_OCCASION_TAGS as readonly string[]).includes(tag) ? t(tag) : tag;
}
