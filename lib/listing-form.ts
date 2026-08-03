import type { ListingKind, PriceMode } from "@prisma/client";

/**
 * Listing form constants and pure validators — the `FoodListing` half of the
 * split Slice 13 established (`lib/seller-profile.ts` for pure rules,
 * `lib/seller.ts` for the session+Prisma reads that use them). Kept dependency
 * -free so a future test can exercise validation without a database.
 */

export const LISTING_KINDS: ListingKind[] = ["SINGLE_ITEM", "MENU", "PACKAGE", "TRAY", "CUSTOM"];
export function isListingKind(value: string): value is ListingKind {
  return (LISTING_KINDS as string[]).includes(value);
}

export const PRICE_MODES: PriceMode[] = ["FIXED", "STARTING_AT", "QUOTE"];
export function isPriceMode(value: string): value is PriceMode {
  return (PRICE_MODES as string[]).includes(value);
}

export const MIN_TITLE_LENGTH = 2;
export const MAX_TITLE_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 2000;
/** A sanity ceiling, not a product limit — `food_listings_feeds_count_positive` enforces the floor (>=1). */
export const MAX_FEEDS_COUNT = 500;
export const MAX_LISTING_CATEGORIES = 5;
export const MAX_INGREDIENT_TAGS = 15;
export const MAX_INGREDIENT_TAG_LENGTH = 30;
export const MAX_OCCASION_TAG_LENGTH = 30;
/**
 * A menu item, not a photo host: hero + a handful of angles is what a dish
 * photo set actually needs, well under the seller gallery's 12 (which spans a
 * whole kitchen's body of work, a different kind of collection).
 */
export const MAX_LISTING_PHOTOS = 8;

/**
 * TTD dollars (what a seller types, e.g. "45.00") to integer cents (what
 * `FoodListing.priceCents` stores, Part D). `null` on anything unparseable —
 * the caller decides whether that's an error or simply "no price entered".
 */
export function parseTtdToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/** The inverse, for pre-filling an edit form from a stored `priceCents`. */
export function centsToTtdInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface PriceValidation {
  ok: boolean;
  /** `undefined` on QUOTE (Part D: NULL is the only legal value there). */
  priceCents?: number | null;
}

/**
 * Validates price against `priceMode`, mirroring `food_listings_price_by_mode`
 * EXACTLY (Slice 2's migration): `priceCents` is NULL **iff** QUOTE;
 * FIXED/STARTING_AT require a non-negative price. Checked here rather than left
 * to the CHECK constraint because a CHECK violation arrives with no usable
 * `.code` (Slice 2's two-shapes-of-constraint-violation finding) — this turns
 * a would-be 500 into a normal form error.
 *
 * ⚠ 0 is deliberately legal — a giveaway is a real listing (Slice 2's own call,
 * carried forward rather than re-litigated).
 */
export function validatePriceForMode(priceMode: PriceMode, rawPrice: string): PriceValidation {
  if (priceMode === "QUOTE") {
    // Whatever the form sent for price is IGNORED, not merely allowed to be
    // absent — QUOTE always writes NULL, never a stray leftover value from a
    // seller who filled the field in before switching modes.
    return { ok: true, priceCents: null };
  }
  const priceCents = parseTtdToCents(rawPrice);
  if (priceCents === null) return { ok: false };
  return { ok: true, priceCents };
}
