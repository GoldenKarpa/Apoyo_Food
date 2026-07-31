/**
 * Category → accent theming (architecture Part F3).
 *
 * Part F3 states the rule as four families rather than as a per-category table:
 *
 *   | Savory / meals              | --green      |
 *   | Desserts / baked            | --gold       |
 *   | Drinks / juices / fresh     | --teal       |
 *   | Holiday / seasonal specials | --terracotta |
 *
 * This module resolves the twelve seeded category slugs (`prisma/seed.ts`)
 * against those four families ONCE, here, so Slice 8's seed, Slice 9's browse
 * filters and Slice 10's "Similar in {category}" rails all tint identically. The
 * alternative — each call site deciding — is how a category ends up green in a
 * rail and gold on its own landing page.
 *
 * ⚠ **The anchor rule is not expressed here and must never be overridden by it**
 * (Part F3, non-negotiable): navigation, the active tab, primary buttons and
 * default CTAs are always `green`, on every screen, whatever category is on it.
 * This mapping applies to category pills, category cards and section accents
 * only — decorative surfaces, never wayfinding.
 *
 * Unknown slugs resolve to `green`, the anchor: Slice 16's category manager lets
 * an admin add categories this file has never heard of, and a new category must
 * render on-brand rather than untinted.
 */

/** The four text-safe accent tokens a category may take. */
export type CategoryAccent = "green" | "gold" | "teal" | "terracotta";

const BY_SLUG: Record<string, CategoryAccent> = {
  // Savory / meals
  breakfast: "green",
  lunch: "green",
  dinner: "green",
  snacks: "green",
  "bbq-grill": "green",
  "vegetarian-vegan": "green",
  catering: "green",
  // Desserts / baked
  desserts: "gold",
  "baked-goods": "gold",
  // Drinks / juices / fresh
  drinks: "teal",
  "juices-smoothies": "teal",
  // Holiday / seasonal
  "holiday-specials": "terracotta",
};

/**
 * `seasonal` wins over the slug table when set. A category row carrying
 * `seasonal = true` is by definition Part F3's "Holiday / seasonal specials"
 * family, and Slice 16 can create new seasonal categories this file predates —
 * reading the column keeps those correctly terracotta without an edit here.
 */
export function categoryAccent(
  category: { slug: string; seasonal?: boolean } | string,
): CategoryAccent {
  if (typeof category === "string") return BY_SLUG[category] ?? "green";
  if (category.seasonal) return "terracotta";
  return BY_SLUG[category.slug] ?? "green";
}

/**
 * Static Tailwind class names per accent.
 *
 * ⚠ These are written out in full rather than interpolated (`bg-${accent}`)
 * because Tailwind scans source text: a class that only ever exists as a
 * template literal is never emitted into the CSS bundle, and the failure is
 * silent — an untinted element, a green build, and nothing in any log. Slice 1's
 * whole token-verification method exists because of that behaviour.
 */
export const ACCENT_CLASSES: Record<
  CategoryAccent,
  { fill: string; text: string; soft: string; border: string; dot: string }
> = {
  green: {
    fill: "bg-green text-card",
    text: "text-green",
    soft: "bg-green-soft text-ink",
    border: "border-green",
    dot: "bg-green",
  },
  gold: {
    fill: "bg-gold text-card",
    text: "text-gold",
    soft: "bg-gold-soft text-ink",
    border: "border-gold",
    dot: "bg-gold",
  },
  teal: {
    fill: "bg-teal text-card",
    text: "text-teal",
    soft: "bg-teal-soft text-ink",
    border: "border-teal",
    dot: "bg-teal",
  },
  terracotta: {
    fill: "bg-terracotta text-card",
    text: "text-terracotta",
    soft: "bg-terracotta-soft text-ink",
    border: "border-terracotta",
    dot: "bg-terracotta",
  },
};
