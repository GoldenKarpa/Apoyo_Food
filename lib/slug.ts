import { prisma } from "@/lib/prisma";

/**
 * Slug generation.
 *
 * ⚠ Slice 14's brief owns this module ("slug generation, title-based,
 * collision-suffixed, for listings + sellers"), but Slice 13 creates the first
 * `FoodSeller` row and cannot do that without a slug. So it lands here and
 * Slice 14 adds the listing-side helper on top rather than re-deciding the
 * rules — the same call Slice 9 made when it pulled `lib/availability.ts`
 * forward from Slice 14.
 *
 * Two rules that are easy to get wrong and expensive to change afterwards:
 *
 *  1. **Accents fold via NFD before the character filter.** Without that step a
 *     naive `[^a-z0-9]` strip deletes accented letters outright, so the DEFAULT
 *     case on a Spanish-first surface — "Cocina de Doña Martínez" — becomes
 *     `cocina-de-do-a-mart-nez`. Decomposing first turns `ñ` into `n` + a
 *     combining tilde, and only the combining mark is dropped. (Apparel hit
 *     exactly this in its own Slice 13.)
 *  2. **Slugs never rotate.** `/sellers/<slug>` is a buyer-facing URL a cook
 *     will paste into WhatsApp; regenerating it when they rename their kitchen
 *     would silently break every link they have ever shared. Renaming updates
 *     `displayName` only — `uniqueSellerSlug` is called once, at creation.
 *
 * Slugs are GLOBALLY unique for both sellers and listings (Slice 2), because
 * `/meals/[slug]` and `/sellers/[slug]` are root-level routes rather than nested
 * under an owner.
 */

/** Longest slug body before the collision suffix — keeps URLs pasteable. */
const MAX_SLUG_LENGTH = 60;

/**
 * Used when a name slugifies to nothing at all — an all-emoji or
 * all-CJK display name is not hypothetical on a marketplace, and a row with an
 * empty slug would render a broken URL rather than fail loudly.
 */
const FALLBACK_STEM = "cocina";

/**
 * Unicode combining diacritics (U+0300–U+036F), the marks NFD splits off.
 * Built with `new RegExp` from escapes on purpose: written as a literal it would
 * put invisible combining characters into this source file, where an editor or
 * a normalising tool could silently rewrite them.
 */
const COMBINING_MARKS = new RegExp("[\u0300-\u036f]", "g");

export function slugify(input: string): string {
  return (
    input
      .normalize("NFD")
      // Strip combining marks only — the base letters survive (rule 1 above).
      .replace(COMBINING_MARKS, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG_LENGTH)
      // A trailing hyphen can reappear after the length cap.
      .replace(/-+$/g, "")
  );
}

/**
 * A seller slug that is free at the moment it is read.
 *
 * ⚠ This is check-then-write, so it is *not* a race-free guarantee — two
 * sellers registering the same kitchen name in the same instant can both be
 * handed `cocina-de-abuela`, and the second write loses on the unique index.
 * That is deliberate: the alternative (a transaction holding a lock across an
 * ecosystem HTTP call) is far worse. The caller retries on `P2002`, which is
 * where the real guarantee lives — see `lib/actions/onboard-seller.ts`.
 */
export async function uniqueSellerSlug(displayName: string): Promise<string> {
  const stem = slugify(displayName) || FALLBACK_STEM;

  const existing = await prisma.foodSeller.findMany({
    where: { slug: { startsWith: stem } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((row) => row.slug));

  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 999 kitchens with the same name is not a real state; a random suffix is
  // still better than throwing on a registration that is otherwise valid.
  return `${stem}-${Math.random().toString(36).slice(2, 8)}`;
}
