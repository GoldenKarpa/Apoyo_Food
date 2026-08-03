import type { AvailabilityType } from "@prisma/client";

import { bitmaskFromDays } from "@/lib/availability";

/**
 * Window-builder form validation — mirrors `food_availability_windows_fields_by_type`
 * (Slice 2's migration) EXACTLY, field for field, so a seller sees a normal form
 * error instead of the raw 500 a CHECK violation produces (no usable `.code`,
 * the constraint name only in the message text — Slice 2's finding, applied
 * here rather than re-discovered).
 *
 * Deliberately separate from `lib/availability.ts`: that module answers "given
 * valid windows, what do they mean" and is unit-tested as pure date/bit math;
 * this one answers "is this seller's input a valid window at all" and is a form
 * concern layered on top. Slice 14's brief owns this half; Slice 9 built the
 * other half early because Slice 1's home page needed it.
 */

export const AVAILABILITY_TYPES: AvailabilityType[] = ["RECURRING_WEEKLY", "PREORDER", "DATE_RANGE"];
export function isAvailabilityType(value: string): value is AvailabilityType {
  return (AVAILABILITY_TYPES as string[]).includes(value);
}

export const MAX_WINDOWS_PER_LISTING = 6;
export const MAX_WINDOW_NOTE_LENGTH = 140;
/**
 * The app's own floor, stricter than the DB's. The CHECK constraint allows
 * `lead_time_days >= 0` (Slice 2's comment: "0 is legal on purpose" — but that
 * comment is about PRICE, not lead time). "0 days ahead" is not a real
 * pre-order — it's same-day, which is what having no PREORDER window at all
 * already means. Requiring >=1 here keeps a seller from creating a window that
 * is technically valid and practically meaningless.
 */
export const MIN_LEAD_TIME_DAYS = 1;
export const MAX_LEAD_TIME_DAYS = 60;

export interface WindowFormInput {
  type: string;
  /** Weekday indices (0 = Sunday .. 6 = Saturday), from the day-picker's selection. */
  days: number[];
  startsOn: string; // YYYY-MM-DD from a native <input type="date">, or ""
  endsOn: string;
  leadTimeDays: string; // raw form value, or ""
  note: string;
}

export type WindowValidationError =
  | "type"
  | "days"
  | "dates"
  | "dateOrder"
  | "leadTime"
  | "note";

export interface ValidatedWindow {
  type: AvailabilityType;
  daysOfWeek: number | null;
  startsOn: Date | null;
  endsOn: Date | null;
  leadTimeDays: number | null;
  note: string | null;
}

export type WindowValidationResult =
  | { ok: true; window: ValidatedWindow }
  | { ok: false; error: WindowValidationError };

/** `YYYY-MM-DD` from a date input, parsed as a calendar date — never through an instant. */
function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export function validateWindowInput(input: WindowFormInput): WindowValidationResult {
  if (!isAvailabilityType(input.type)) return { ok: false, error: "type" };
  const type = input.type;

  // Lead time: optional on RECURRING_WEEKLY/DATE_RANGE, required on PREORDER
  // (Part D's own example — "holiday menu, order 2 days ahead" — is a
  // DATE_RANGE window WITH a lead time, which is why every type gets the field
  // rather than only PREORDER).
  let leadTimeDays: number | null = null;
  const rawLead = input.leadTimeDays.trim();
  if (rawLead !== "") {
    const parsed = Number(rawLead);
    if (!Number.isInteger(parsed) || parsed < MIN_LEAD_TIME_DAYS || parsed > MAX_LEAD_TIME_DAYS) {
      return { ok: false, error: "leadTime" };
    }
    leadTimeDays = parsed;
  } else if (type === "PREORDER") {
    return { ok: false, error: "leadTime" };
  }

  const note = input.note.trim();
  if (note.length > MAX_WINDOW_NOTE_LENGTH) return { ok: false, error: "note" };

  if (type === "RECURRING_WEEKLY") {
    if (input.days.length === 0) return { ok: false, error: "days" };
    return {
      ok: true,
      window: {
        type,
        daysOfWeek: bitmaskFromDays(input.days),
        startsOn: null,
        endsOn: null,
        leadTimeDays,
        note: note || null,
      },
    };
  }

  if (type === "DATE_RANGE") {
    const startsOn = parseCalendarDate(input.startsOn);
    const endsOn = parseCalendarDate(input.endsOn);
    if (!startsOn || !endsOn) return { ok: false, error: "dates" };
    // Compared as ISO strings, not as instants — the same rule
    // `lib/availability.ts` follows for `@db.Date` columns, so a range
    // boundary can never drift by a timezone offset.
    if (input.endsOn < input.startsOn) return { ok: false, error: "dateOrder" };
    return {
      ok: true,
      window: { type, daysOfWeek: null, startsOn, endsOn, leadTimeDays, note: note || null },
    };
  }

  // PREORDER
  return {
    ok: true,
    window: { type, daysOfWeek: null, startsOn: null, endsOn: null, leadTimeDays, note: note || null },
  };
}
