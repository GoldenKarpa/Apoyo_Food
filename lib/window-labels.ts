import type { describeWindow } from "@/lib/availability";

/**
 * Builds the label set `describeWindow` needs, from a next-intl translation
 * function — factored out at Slice 14 so the buyer detail page (`/meals/[slug]`,
 * Slice 10) and the seller's window builder render IDENTICAL wording for the
 * same window, from one construction rather than two that could drift.
 *
 * ⚠ `days` is a separate parameter, not read inside this function. The
 * catalogue stores `availability.days` as a JSON ARRAY, and next-intl only
 * returns it un-formatted via `t.raw("days")` — a distinct method from the
 * plain `t(key)` this function otherwise uses, so the caller resolves it
 * first rather than this module trying to detect which method a given `t`
 * supports.
 */
export function buildWindowLabels(
  t: (key: string, values?: Record<string, string | number>) => string,
  days: string[],
  locale: string,
): Parameters<typeof describeWindow>[1] {
  return {
    days,
    everyDay: t("everyDay"),
    weekends: t("weekend"),
    weekdays: t("weekdaysOnly"),
    preorder: (n: number) => t("preorder", { days: n }),
    season: (from: string, to: string) =>
      t("seasonWindow", { from: formatIsoDate(from, locale), to: formatIsoDate(to, locale) }),
  };
}

/** `startsOn`/`endsOn` are `@db.Date` — formatted as the calendar date they
 * represent, never converted through an instant (Slice 2/9's timezone rule). */
export function formatIsoDate(iso: string, locale: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}
