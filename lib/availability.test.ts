import { describe, expect, it } from "vitest";

import {
  addDays,
  bitmaskFromDays,
  daysFromBitmask,
  describeWindow,
  localDay,
  summarizeAvailability,
  weekdayBitmask,
  windowCoversDay,
  type AvailabilityWindowLike,
} from "./availability";

/**
 * `lib/availability.ts`'s own unit suite — Slice 14's explicit instruction:
 * "this feeds every discovery badge and filter; get it right once", and the
 * structural gap the Phase-0 review flagged and Slice 13 re-flagged (no
 * `npm test` anywhere in the repo). This is the first.
 *
 * These tests codify claims that were previously proven only by ad hoc
 * verification scripts and code comments — Slice 9's "a server doing weekday
 * maths in UTC lights the wrong day's badge for four hours out of every
 * twenty-four" and "leadTimeDays does NOT make a listing unavailable today"
 * chief among them. Both are asserted directly here now, not just narrated.
 */

function day(iso: string, weekday: number) {
  return { iso, weekday };
}

function window(overrides: Partial<AvailabilityWindowLike>): AvailabilityWindowLike {
  return {
    type: "RECURRING_WEEKLY",
    daysOfWeek: null,
    startsOn: null,
    endsOn: null,
    leadTimeDays: null,
    note: null,
    ...overrides,
  };
}

describe("localDay", () => {
  it("resolves the fixed America/Port_of_Spain zone, not server-local time", () => {
    // UTC-04:00, no DST — 2026-01-01T02:00Z is still 2025-12-31 at 22:00 local.
    // This is the exact scenario Slice 9's own comment names: a server doing
    // weekday math in UTC lights the wrong day's badge for four hours a day.
    expect(localDay(new Date("2026-01-01T02:00:00.000Z")).iso).toBe("2025-12-31");
    // The moment local time crosses midnight (04:00 UTC), the day rolls.
    expect(localDay(new Date("2026-01-01T04:00:00.000Z")).iso).toBe("2026-01-01");
    expect(localDay(new Date("2026-01-01T03:59:59.000Z")).iso).toBe("2025-12-31");
  });

  it("returns the correct weekday index (0 = Sunday .. 6 = Saturday)", () => {
    // 2026-08-02 is a Sunday.
    expect(localDay(new Date("2026-08-02T12:00:00.000Z")).weekday).toBe(0);
    // 2026-08-03 is a Monday.
    expect(localDay(new Date("2026-08-03T12:00:00.000Z")).weekday).toBe(1);
    // 2026-08-08 is a Saturday.
    expect(localDay(new Date("2026-08-08T12:00:00.000Z")).weekday).toBe(6);
  });
});

describe("addDays", () => {
  it("rolls forward across a month boundary", () => {
    expect(addDays(day("2026-01-31", 6), 1)).toEqual(day("2026-02-01", 0));
  });

  it("rolls forward across a year boundary", () => {
    expect(addDays(day("2025-12-31", 3), 1)).toEqual(day("2026-01-01", 4));
  });

  it("wraps the weekday index correctly for large offsets", () => {
    expect(addDays(day("2026-08-02", 0), 14).weekday).toBe(0);
    expect(addDays(day("2026-08-02", 0), 14).iso).toBe("2026-08-16");
  });
});

describe("bitmaskFromDays / daysFromBitmask", () => {
  it("round-trips an arbitrary set of days", () => {
    const days = [0, 3, 6]; // Sunday, Wednesday, Saturday
    expect(daysFromBitmask(bitmaskFromDays(days))).toEqual(days);
  });

  it("matches weekdayBitmask for a single day", () => {
    expect(bitmaskFromDays([2])).toBe(weekdayBitmask(2));
  });

  it("every-day is 127, no-days is 0", () => {
    expect(bitmaskFromDays([0, 1, 2, 3, 4, 5, 6])).toBe(127);
    expect(bitmaskFromDays([])).toBe(0);
  });
});

describe("windowCoversDay", () => {
  it("RECURRING_WEEKLY covers exactly the bits set", () => {
    const weekends = window({ type: "RECURRING_WEEKLY", daysOfWeek: 0b1000001 }); // Sun + Sat
    expect(windowCoversDay(weekends, day("x", 0))).toBe(true); // Sun
    expect(windowCoversDay(weekends, day("x", 6))).toBe(true); // Sat
    expect(windowCoversDay(weekends, day("x", 3))).toBe(false); // Wed
  });

  it("DATE_RANGE is inclusive of both boundary dates", () => {
    const range = window({ type: "DATE_RANGE", startsOn: new Date("2026-12-01T00:00:00Z"), endsOn: new Date("2026-12-24T00:00:00Z") });
    expect(windowCoversDay(range, day("2026-11-30", 1))).toBe(false);
    expect(windowCoversDay(range, day("2026-12-01", 2))).toBe(true); // start, inclusive
    expect(windowCoversDay(range, day("2026-12-24", 4))).toBe(true); // end, inclusive
    expect(windowCoversDay(range, day("2026-12-25", 5))).toBe(false);
  });

  it("DATE_RANGE with a missing boundary covers nothing", () => {
    expect(windowCoversDay(window({ type: "DATE_RANGE", startsOn: new Date("2026-01-01") }), day("2026-01-01", 4))).toBe(false);
  });

  it("PREORDER covers every day — it is permanently on offer", () => {
    const preorder = window({ type: "PREORDER", leadTimeDays: 5 });
    expect(windowCoversDay(preorder, day("2026-01-01", 4))).toBe(true);
    expect(windowCoversDay(preorder, day("2099-12-31", 4))).toBe(true);
  });
});

describe("summarizeAvailability — leadTimeDays does not gate 'available today'", () => {
  it("a PREORDER window with a 2-day lead time is still available today", () => {
    // ⚠ The exact claim Slice 9's comment makes and this test now enforces:
    // conflating lead time with same-day availability would empty the
    // "available today" rail of every pre-order listing in the catalogue.
    const now = new Date("2026-08-05T15:00:00Z"); // a Wednesday, midday Trinidad
    const summary = summarizeAvailability([window({ type: "PREORDER", leadTimeDays: 2 })], now);
    expect(summary.availableToday).toBe(true);
    expect(summary.leadTimeDays).toBe(2);
  });
});

describe("summarizeAvailability — tone/label precedence", () => {
  const now = new Date("2026-08-05T15:00:00Z"); // Wednesday

  it("a listing in an active seasonal window reads 'seasonal', even alongside a recurring window", () => {
    const summary = summarizeAvailability(
      [
        window({ type: "DATE_RANGE", startsOn: new Date("2026-08-01"), endsOn: new Date("2026-08-10") }),
        window({ type: "RECURRING_WEEKLY", daysOfWeek: 127 }),
      ],
      now,
    );
    expect(summary.seasonalNow).toBe(true);
    expect(summary.labelKey).toBe("seasonal");
    expect(summary.tone).toBe("seasonal");
  });

  it("a purely seasonal listing OUTSIDE its window (future) reads 'seasonal', not 'unavailable'", () => {
    const summary = summarizeAvailability(
      [window({ type: "DATE_RANGE", startsOn: new Date("2026-12-01"), endsOn: new Date("2026-12-24") })],
      now,
    );
    expect(summary.seasonalNow).toBe(false);
    expect(summary.labelKey).toBe("seasonal");
  });

  it("recurring + today beats weekend and preorder", () => {
    const summary = summarizeAvailability([window({ type: "RECURRING_WEEKLY", daysOfWeek: 127 })], now);
    expect(summary.availableToday).toBe(true);
    expect(summary.labelKey).toBe("today");
    expect(summary.tone).toBe("available");
  });

  it("recurring but only on the weekend, checked mid-week, reads 'weekend'", () => {
    const weekendsOnly = window({ type: "RECURRING_WEEKLY", daysOfWeek: 0b1000001 });
    const summary = summarizeAvailability([weekendsOnly], now); // now is a Wednesday
    expect(summary.availableToday).toBe(false);
    expect(summary.availableThisWeekend).toBe(true);
    expect(summary.labelKey).toBe("weekend");
  });

  it("a bare PREORDER window reads 'preorder' with its lead time", () => {
    const summary = summarizeAvailability([window({ type: "PREORDER", leadTimeDays: 3 })], now);
    expect(summary.labelKey).toBe("preorder");
    expect(summary.labelValues).toEqual({ days: 3 });
  });

  it("no windows at all reads 'unavailable' — a listing with nothing configured", () => {
    const summary = summarizeAvailability([], now);
    expect(summary.labelKey).toBe("unavailable");
    expect(summary.availableToday).toBe(false);
  });
});

describe("summarizeAvailability — this-weekend wraps correctly on a Sunday", () => {
  it("'this weekend' includes TODAY when today is Sunday, not six days away", () => {
    const sunday = new Date("2026-08-02T15:00:00Z"); // confirmed Sunday above
    const weekendsOnly = window({ type: "RECURRING_WEEKLY", daysOfWeek: 0b1000001 });
    const summary = summarizeAvailability([weekendsOnly], sunday);
    expect(summary.availableToday).toBe(true);
    expect(summary.availableThisWeekend).toBe(true);
  });
});

describe("describeWindow", () => {
  const labels = {
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    everyDay: "Every day",
    weekends: "Weekends",
    weekdays: "Weekdays",
    preorder: (n: number) => `Pre-order · ${n} days`,
    season: (from: string, to: string) => `${from} – ${to}`,
  };

  it("renders the every-day special case", () => {
    expect(describeWindow(window({ type: "RECURRING_WEEKLY", daysOfWeek: 127 }), labels)).toBe("Every day");
  });

  it("renders the weekends special case (Sun + Sat, no other days)", () => {
    expect(describeWindow(window({ type: "RECURRING_WEEKLY", daysOfWeek: 0b1000001 }), labels)).toBe("Weekends");
  });

  it("renders the weekdays special case (Mon-Fri, no weekend)", () => {
    expect(describeWindow(window({ type: "RECURRING_WEEKLY", daysOfWeek: 0b0111110 }), labels)).toBe("Weekdays");
  });

  it("renders an arbitrary combination as a joined day list", () => {
    // Mon + Wed + Fri
    const mask = bitmaskFromDays([1, 3, 5]);
    expect(describeWindow(window({ type: "RECURRING_WEEKLY", daysOfWeek: mask }), labels)).toBe("Mon · Wed · Fri");
  });

  it("renders a DATE_RANGE window via the season formatter", () => {
    const w = window({ type: "DATE_RANGE", startsOn: new Date("2026-12-01"), endsOn: new Date("2026-12-24") });
    expect(describeWindow(w, labels)).toBe("2026-12-01 – 2026-12-24");
  });

  it("renders a DATE_RANGE window with a missing boundary as empty", () => {
    expect(describeWindow(window({ type: "DATE_RANGE", startsOn: new Date("2026-12-01") }), labels)).toBe("");
  });

  it("renders a PREORDER window via the preorder formatter, defaulting to 1 day", () => {
    expect(describeWindow(window({ type: "PREORDER", leadTimeDays: 4 }), labels)).toBe("Pre-order · 4 days");
    expect(describeWindow(window({ type: "PREORDER", leadTimeDays: null }), labels)).toBe("Pre-order · 1 days");
  });
});
