"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A multi-select list of pill toggles — languages and fulfilment modes, and
 * whatever a later slice needs in the same shape.
 *
 * ⚠ Real `<button aria-pressed>` controls, never a styled `<div onClick>` or a
 * checkbox hidden behind a label. Both alternatives ship regularly and both are
 * broken for a keyboard or screen-reader user; `aria-pressed` also means
 * selection is never conveyed by colour alone, which is the same rule
 * `<RegionMap>` follows for its own region buttons.
 *
 * Contrast, on the Slice 1 tokens: selected is `card`-cream on `green` (5.44:1),
 * unselected is full `ink` on `sunken` (12.1:1). `ink-muted` deliberately never
 * appears on `sunken` — it measures 4.37:1 there.
 */
export interface ToggleOption {
  value: string;
  label: string;
  hint?: string;
}

export function ToggleList({
  options,
  selected,
  onToggle,
  legend,
}: {
  options: ToggleOption[];
  selected: string[];
  onToggle: (value: string) => void;
  legend: string;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-label font-medium text-ink">{legend}</legend>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <li key={option.value}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggle(option.value)}
                title={option.hint}
                className={cn(
                  "tap-target flex items-center gap-2 rounded-pill px-4 text-label font-medium transition-colors duration-200 ease-soft",
                  isSelected ? "bg-green text-card" : "bg-sunken text-ink hover:bg-green-soft",
                )}
              >
                {isSelected && <Check aria-hidden className="size-4" />}
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
