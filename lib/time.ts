/**
 * Fixed zone for ALL display and date math (architecture Part C, BUILD_SLICES.md
 * conventions). Trinidad & Tobago has no DST, so this never needs DST logic and
 * never changes with server TZ config.
 *
 * The rule, in full: timestamps are stored as UTC `timestamptz`; every
 * user-facing rendering and every piece of date arithmetic (availability
 * windows, "available today / this weekend" badges, `respondBy` deadlines,
 * Fresh Today's 24h expiry, order `fulfillmentAt`) resolves in this zone.
 * Never use server-local time for anything a user sees.
 *
 * ⚠ `lib/availability.ts` (Slice 14) does the heaviest date math in the app and
 * feeds every discovery badge and filter — it must read the zone from here
 * rather than re-deriving it.
 */
export const FOOD_TIMEZONE = "America/Port_of_Spain";
