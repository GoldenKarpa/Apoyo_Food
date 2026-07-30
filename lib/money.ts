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
 */

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
export function formatTtd(value: PriceInput, locale: string = "en"): string {
  const amount = toNumber(value);
  const hasCents = !Number.isInteger(amount);
  const formatted = new Intl.NumberFormat(locale, {
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
export function formatCentsTtd(cents: number, locale: string = "en"): string {
  return formatTtd(cents / 100, locale);
}
