import type { AvailabilityType } from "@prisma/client";

import { FOOD_TIMEZONE } from "@/lib/time";
import type { AvailabilityTone } from "@/components/ui/availability-stamp";

/**
 * Availability computation — "available today / this weekend", and the stamp a
 * listing wears.
 *
 * ⚠ **This feeds every discovery badge and every availability filter in the
 * app** (Part D is emphatic that these are COMPUTED from windows and are never a
 * live-inventory flag — that is Food's anti-waste stance expressed structurally,
 * and Part E2 repeats it: "explicitly not live inventory"). Slice 14's brief
 * says to get it right once; this is that module, arriving early because Slice
 * 9's home sections cannot be built without it. Slice 14 adds the seller-facing
 * window *builder* on top and does not need to change anything here.
 *
 * ── The timezone rule, which is the whole difficulty ──
 * All display and date maths resolve in **America/Port_of_Spain** (`lib/time.ts`)
 * and never in server-local time. Trinidad has no DST, so this needs no DST
 * logic — but it does need the offset applied *before* any weekday or calendar
 * comparison, because a UTC server past 20:00 is already "tomorrow" and would
 * light the wrong day's badge for every listing on the site.
 *
 * `startsOn`/`endsOn` are `@db.Date` — pure calendar dates with no time-of-day
 * meaning (Slice 2) — so they are compared as `YYYY-MM-DD` strings rather than
 * as instants. Comparing them as instants is exactly how "available from the
 * 1st" silently becomes "from the 30th at 20:00" for someone.
 */

export interface AvailabilityWindowLike {
  type: AvailabilityType;
  /** RECURRING_WEEKLY: bit 0 = Sunday … bit 6 = Saturday. */
  daysOfWeek: number | null;
  startsOn: Date | null;
  endsOn: Date | null;
  leadTimeDays: number | null;
  note?: string | null;
}

/** `YYYY-MM-DD` and the weekday index, both resolved in the fixed zone. */
export interface LocalDay {
  iso: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * "What day is it in Trinidad right now?"
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is used rather than manual
 * offset arithmetic: it is the only approach that stays correct without this
 * module knowing what the offset is, and the fixed-zone rule is about
 * *correctness of the answer*, not about hard-coding -04:00 in a second place.
 */
export function localDay(instant: Date = new Date()): LocalDay {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FOOD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** Adds whole days to a `YYYY-MM-DD`, staying in calendar space. */
export function addDays(day: LocalDay, days: number): LocalDay {
  const date = new Date(`${day.iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return { iso: date.toISOString().slice(0, 10), weekday: (day.weekday + days + 700) % 7 };
}

/** A `@db.Date` value back to the `YYYY-MM-DD` it actually represents. */
function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function coversWeekday(window: AvailabilityWindowLike, weekday: number): boolean {
  if (window.daysOfWeek === null) return false;
  return (window.daysOfWeek & (1 << weekday)) !== 0;
}

/**
 * Does this window make the listing obtainable **on** the given day?
 *
 * ⚠ `leadTimeDays` is deliberately NOT applied here. A two-day lead time does
 * not mean "unavailable today" — it means an order placed today is collected on
 * Thursday, and the listing is still very much on offer. Conflating the two
 * would empty the "available today" rail of every pre-order listing in the
 * catalogue, which is most of the interesting ones. Slice 17 applies lead time
 * where it actually belongs: validating a *requested fulfilment date*.
 */
export function windowCoversDay(window: AvailabilityWindowLike, day: LocalDay): boolean {
  switch (window.type) {
    case "RECURRING_WEEKLY":
      return coversWeekday(window, day.weekday);
    case "DATE_RANGE": {
      if (!window.startsOn || !window.endsOn) return false;
      return isoOf(window.startsOn) <= day.iso && day.iso <= isoOf(window.endsOn);
    }
    case "PREORDER":
      // A pre-order listing is permanently on offer; the lead time governs how
      // far ahead the collection date must be, not whether it can be ordered.
      return true;
    default:
      return false;
  }
}

export interface AvailabilitySummary {
  availableToday: boolean;
  availableTomorrow: boolean;
  /** Saturday or Sunday of the coming weekend (today included when it is one). */
  availableThisWeekend: boolean;
  /** In a seasonal window right now — drives Part E1's occasion rail. */
  seasonalNow: boolean;
  /** Smallest lead time across the listing's windows, if any. */
  leadTimeDays: number | null;
  /** What `<AvailabilityStamp>` should wear. */
  tone: AvailabilityTone;
  /** Which localized label to render — `messages.availability.<key>`. */
  labelKey: "today" | "weekend" | "preorder" | "seasonal" | "unavailable";
  /** Interpolation values for that label (e.g. the lead time in days). */
  labelValues?: Record<string, string | number>;
}

/**
 * The next Saturday and Sunday, today included when today is one of them.
 * "This weekend" on a Sunday means today, not six days away.
 */
function weekendDays(today: LocalDay): LocalDay[] {
  const days: LocalDay[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(today, offset);
    if (day.weekday === 6 || day.weekday === 0) days.push(day);
    if (days.length === 2) break;
  }
  return days;
}

export function summarizeAvailability(
  windows: AvailabilityWindowLike[],
  now: Date = new Date(),
): AvailabilitySummary {
  const today = localDay(now);
  const tomorrow = addDays(today, 1);

  const availableToday = windows.some((w) => windowCoversDay(w, today));
  const availableTomorrow = windows.some((w) => windowCoversDay(w, tomorrow));
  const availableThisWeekend = weekendDays(today).some((day) =>
    windows.some((w) => windowCoversDay(w, day)),
  );

  const seasonalNow = windows.some((w) => w.type === "DATE_RANGE" && windowCoversDay(w, today));

  const leadTimes = windows.map((w) => w.leadTimeDays).filter((n): n is number => n !== null);
  const leadTimeDays = leadTimes.length > 0 ? Math.min(...leadTimes) : null;

  // Stamp precedence, most specific first. A seasonal listing that is in season
  // says so; otherwise "today" beats "this weekend" beats "pre-order", because
  // the soonest true statement is the most useful one on a card.
  let tone: AvailabilityTone = "preorder";
  let labelKey: AvailabilitySummary["labelKey"] = "preorder";
  let labelValues: Record<string, string | number> | undefined;

  const hasRecurring = windows.some((w) => w.type === "RECURRING_WEEKLY");
  const hasSeasonal = windows.some((w) => w.type === "DATE_RANGE");
  const hasPreorder = windows.some((w) => w.type === "PREORDER");

  if (seasonalNow || (hasSeasonal && !hasRecurring && !hasPreorder)) {
    tone = "seasonal";
    labelKey = "seasonal";
  } else if (availableToday && hasRecurring) {
    tone = "available";
    labelKey = "today";
  } else if (availableThisWeekend && hasRecurring) {
    tone = "recurring";
    labelKey = "weekend";
  } else if (hasPreorder || leadTimeDays !== null) {
    tone = "preorder";
    labelKey = "preorder";
    labelValues = { days: leadTimeDays ?? 1 };
  } else if (windows.length === 0) {
    tone = "preorder";
    labelKey = "unavailable";
  }

  return {
    availableToday,
    availableTomorrow,
    availableThisWeekend,
    seasonalNow,
    leadTimeDays,
    tone,
    labelKey,
    labelValues,
  };
}

/**
 * A single window rendered as human-readable copy ("Weekends", "Pre-order · 2
 * days"). Slice 14 renders this back to a seller as they build a window, which
 * is why it takes one window rather than a summary.
 */
export function describeWindow(
  window: AvailabilityWindowLike,
  labels: { days: string[]; everyDay: string; weekends: string; weekdays: string; preorder: (n: number) => string; season: (from: string, to: string) => string },
): string {
  switch (window.type) {
    case "RECURRING_WEEKLY": {
      const mask = window.daysOfWeek ?? 0;
      if (mask === 127) return labels.everyDay;
      if (mask === 0b1000001) return labels.weekends;
      if (mask === 0b0111110) return labels.weekdays;
      return labels.days.filter((_, index) => (mask & (1 << index)) !== 0).join(" · ");
    }
    case "DATE_RANGE":
      return window.startsOn && window.endsOn
        ? labels.season(isoOf(window.startsOn), isoOf(window.endsOn))
        : "";
    case "PREORDER":
      return labels.preorder(window.leadTimeDays ?? 1);
    default:
      return "";
  }
}

/**
 * A calendar-date `YYYY-MM-DD` plus a `HH:mm` clock time, resolved as an
 * instant in the fixed zone (Slice 17: the order request form's requested
 * date/time).
 *
 * ⚠ Trinidad has no DST (the module header's own rule), so the offset is a
 * plain, permanently-correct literal — `Date`'s own ISO parser accepts an
 * explicit offset directly, which is simpler and just as correct as routing
 * through `Intl` for a construction this module never needs to do in reverse.
 */
export function localInstant(dateIso: string, time: string): Date {
  return new Date(`${dateIso}T${time}:00.000-04:00`);
}

/** Whole CALENDAR days between two `YYYY-MM-DD` strings, staying in calendar space. */
function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00.000Z`);
  const to = Date.parse(`${toIso}T00:00:00.000Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export interface FulfillmentValidation {
  ok: boolean;
  reason?: "past" | "outOfWindow" | "leadTime";
  /** LEAD_TIME only — the smallest lead time among the windows that DO cover the requested day, so the form can say "earliest in N days". */
  minLeadDays?: number;
}

/**
 * Validates a buyer's REQUESTED fulfilment instant against a listing's
 * availability windows (Slice 17, architecture E5: "requested date/time
 * (validated against the listing's availability windows + lead time)").
 *
 * ⚠ Two rules that are easy to get backwards:
 *  - **Lead time is checked against the window(s) that actually COVER the
 *    requested day**, not every window on the listing — Slice 2's CHECK
 *    constraint (and this module's own `windowCoversDay`) already established
 *    that `leadTimeDays` may sit on ANY window type, so a PREORDER window's
 *    lead time must never block a request that is really being served by a
 *    separate RECURRING_WEEKLY window with no lead time at all.
 *  - **A listing with NO windows at all is not rejected here.** `windows.length
 *    === 0` renders "Ask the cook" on the card (`summarizeAvailability`), but
 *    that is a display fallback, not a computed constraint — there is nothing
 *    to validate against, so any future instant is accepted and the specifics
 *    are worked out in the order thread, exactly as an unscheduled CUSTOM
 *    listing already implies.
 */
export function validateRequestedFulfillment(
  windows: AvailabilityWindowLike[],
  requestedAt: Date,
  now: Date = new Date(),
): FulfillmentValidation {
  if (requestedAt.getTime() <= now.getTime()) return { ok: false, reason: "past" };
  if (windows.length === 0) return { ok: true };

  const today = localDay(now);
  const requestedDay = localDay(requestedAt);
  const covering = windows.filter((w) => windowCoversDay(w, requestedDay));
  if (covering.length === 0) return { ok: false, reason: "outOfWindow" };

  const daysAhead = calendarDaysBetween(today.iso, requestedDay.iso);
  const satisfiesLead = covering.some((w) => (w.leadTimeDays ?? 0) <= daysAhead);
  if (!satisfiesLead) {
    const minLeadDays = Math.min(...covering.map((w) => w.leadTimeDays ?? 0));
    return { ok: false, reason: "leadTime", minLeadDays };
  }

  return { ok: true };
}

/**
 * SQL fragment matching listings available on a given weekday.
 *
 * Discovery filters must run **in the database**, not by loading every listing
 * and calling `summarizeAvailability` in Node — that works at 50 seed listings
 * and stops working at 5,000. Kept beside the TypeScript so the two definitions
 * of "available on a day" sit in one file and can be diffed by eye.
 */
export function weekdayBitmask(weekday: number): number {
  return 1 << weekday;
}

/**
 * Bitmask <-> weekday-index-array conversions, added at Slice 14 for the
 * seller-facing window builder's day picker. Pure bit math, so it belongs
 * beside `weekdayBitmask` rather than in the form-validation module — these
 * two functions are the only place either direction of the conversion happens,
 * which is what keeps the picker's UI state and the stored `daysOfWeek` column
 * from ever disagreeing about which bit means which day.
 */
export function bitmaskFromDays(days: readonly number[]): number {
  return days.reduce((mask, day) => mask | weekdayBitmask(day), 0);
}

export function daysFromBitmask(mask: number): number[] {
  const days: number[] = [];
  for (let day = 0; day < 7; day += 1) {
    if ((mask & weekdayBitmask(day)) !== 0) days.push(day);
  }
  return days;
}
