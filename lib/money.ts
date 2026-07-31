/**
 * Currency is TTD everywhere, with no second currency anywhere in the product.
 *
 * This module exists specifically because the Emergent food mockups render
 * prices in **€** (a render artifact of the mockup tool, flagged as
 * "do not reproduce" in architecture Part F3 and again in BUILD_SLICES.md's
 * Slice 8). Routing every price through one formatter means a stray currency
 * symbol has nowhere to enter: there is no other correct way to render a price,
 * so copying a mockup literally is not an available mistake later.
 *
 * Format is the ecosystem's shared convention, `$X,XXX TTD` — symbol, grouped
 * amount, then the code, per the Sobremesa spec §1.8 and Part F3.
 *
 * ⚠ **The number format is pinned to `en-TT` and is deliberately NOT the
 * viewer's UI locale.** Passing the UI locale here was a real bug, found in the
 * Phase-0 review: `es` renders 1250 as `1250` (no separator at four digits) and
 * 12500 as `12.500`, so the same dish showed a different price format depending
 * on the language toggle — and `$12.500 TTD` reads as twelve-point-five to an
 * English speaker. Neither matches the spec's `$X,XXX TTD`.
 *
 * Pinning to Trinidad's own convention is also the correct product call, not
 * just the convenient one: TTD is Trinidad's currency, and the Spanish-speaking
 * sellers and buyers this platform serves are living in and transacting in
 * Trinidad. One unambiguous price format for everyone beats a locale-correct
 * one that renders the most important number on the page two different ways.
 */

/**
 * Fixed regardless of UI language — see above. `en-TT` gives comma grouping and
 * a dot decimal, exactly the spec's `$X,XXX TTD`.
 */
const NUMBER_LOCALE = "en-TT";

/** Prices are stored as integer cents (`priceCents`, architecture Part D). */
export type PriceInput = number | string | { toString(): string };

function toNumber(value: PriceInput): number {
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format a whole-TTD amount, e.g. `$250 TTD` / `$1,250 TTD`. Whole numbers
 * render without decimals (food prices are overwhelmingly whole and ".00" adds
 * visual noise to a card grid); non-whole amounts keep exactly two.
 */
export function formatTtd(value: PriceInput): string {
  const amount = toNumber(value);
  const hasCents = !Number.isInteger(amount);
  const formatted = new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `$${formatted} TTD`;
}

/**
 * Format a price stored as integer cents — what `FoodListing.priceCents` and
 * `FoodOrder.subtotalCents` actually hold (Part D). Use this at every call site
 * that reads the database; `formatTtd` is for already-converted amounts.
 */
export function formatCentsTtd(cents: number): string {
  return formatTtd(cents / 100);
}
