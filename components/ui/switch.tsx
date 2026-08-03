"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A real ARIA switch (`role="switch"`, `aria-checked`) — deliberately distinct
 * from the `aria-pressed` toggle buttons used elsewhere in this app
 * (`<RegionMap>`'s region buttons, `<ToggleList>`). Those are "select zero or
 * more from a set"; this is "one thing, on or off" — a listing's `active`
 * pause switch, first built at Slice 14. Screen readers announce the two
 * roles differently, and using the wrong one here would tell an assistive
 * technology user they're picking from a list of one.
 *
 * `card`-cream thumb on `green` when on (5.44:1 is irrelevant here — the thumb
 * carries no text — but `green` is the anchor accent, Part F3's rule for any
 * "on" affordance) and `sunken` when off, matching every other resting-state
 * surface in the design system.
 */
export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}

export function Switch({ checked, onCheckedChange, disabled = false, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "tap-target relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition-colors duration-200 ease-soft disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-green" : "bg-sunken",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-pill bg-card shadow-soft transition-transform duration-200 ease-soft",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
