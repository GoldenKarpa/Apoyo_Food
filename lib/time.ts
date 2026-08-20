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

/**
 * An order's `fulfillmentAt` (a real instant, unlike `startsOn`/`endsOn`'s
 * pure calendar dates), rendered in the fixed zone regardless of the viewer's
 * own device timezone — Part D's order-summary card: "requested date/time in
 * America/Port_of_Spain". Slice 17's first caller.
 */
export function formatFulfillmentInstant(instant: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: FOOD_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

/**
 * A conversation timestamp — short date + time, in the fixed zone.
 *
 * ⚠ **This exists because a bare `new Intl.DateTimeFormat(locale, …)` is a bug
 * in two independent ways**, and `<OrderThread>`/`<ThreadList>` had it in both
 * forms until PD-S10 (the defect Apparel found first, in the same components'
 * equivalents):
 *
 *  1. **Wrong DAY for the seller.** With no `timeZone`, Node formats in the
 *     server's zone. T&T is UTC-4, so anything sent after 20:00 local renders
 *     as the following date — on a surface whose whole job is "when did this
 *     customer write to me".
 *  2. **A hydration mismatch, once a component is isomorphic.** PD-S10 made
 *     both components render on the client as well as the server, and an
 *     unpinned formatter reads the UTC server on the first pass and the
 *     visitor's own device zone on hydration. React then reconciles two
 *     different strings for the same instant.
 *
 * The module header already forbids this in words ("Never use server-local time
 * for anything a user sees"); these helpers make it forbidden in practice, so a
 * caller has something to reach for other than the raw constructor.
 */
export function formatMessageInstant(instant: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: FOOD_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(instant);
}

/** A calendar day in the fixed zone — "talking since 27 Jul 2026". */
export function formatMediumDate(instant: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: FOOD_TIMEZONE,
    dateStyle: "medium",
  }).format(instant);
}
