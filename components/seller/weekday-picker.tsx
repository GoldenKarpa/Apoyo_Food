"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * 7 day toggles for a RECURRING_WEEKLY window's `daysOfWeek` bitmask (0 =
 * Sunday .. 6 = Saturday, matching `lib/availability.ts`'s own indexing —
 * built once there and never re-derived here).
 *
 * Reuses `messages.availability.days` — the SAME three-letter day labels the
 * buyer surface's window summaries already render (`describeWindow`'s day
 * list), so a seller building "Mon · Wed · Fri" here and a buyer reading
 * "Mon · Wed · Fri" on the listing page see identical words for identical bits.
 */
export function WeekdayPicker({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (day: number) => void;
}) {
  const t = useTranslations("seller.availabilityForm");
  const days = useTranslations("availability").raw("days") as string[];

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label font-medium text-ink">{t("daysLabel")}</legend>
      <ul className="flex flex-wrap gap-2">
        {days.map((label, index) => {
          const isSelected = selected.includes(index);
          return (
            <li key={index}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggle(index)}
                className={cn(
                  "flex size-11 items-center justify-center rounded-pill text-label font-medium transition-colors duration-200 ease-soft",
                  isSelected ? "bg-green text-card" : "bg-sunken text-ink hover:bg-green-soft",
                )}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
