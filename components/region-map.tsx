"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RegionKey } from "@prisma/client";

import { REGION_ADMIN_IDS, REGION_KEYS, REGION_SUBAREAS } from "@/lib/regions";
import { TT_ADMIN_PATHS, TT_VIEWBOX } from "@/lib/tt-region-paths";
import { cn } from "@/lib/utils";

/**
 * The Trinidad & Tobago area picker.
 *
 * Ported from the Apoyo-Demia app's `components/questions/region-map.tsx` —
 * same geometry, same eight `RegionKey` groupings, so a "Central" cook means
 * the same thing in every vertical. Slice 13's onboarding reuses this exact
 * component for a seller's 1–3 service areas; here it is the buyer-side
 * directory filter.
 *
 * ⚠ **Restyled, not copied.** Part F3 asks for "a warm illustrated Trinidad,
 * selected area in **teal** — not a cold GIS map", and the Apoyo-Demia original
 * is a dark charcoal panel with gold selection. The geometry file is shared
 * verbatim; the palette is Sobremesa's and deliberately diverges.
 *
 * Accessibility, because an SVG map is the easiest place in an app to build a
 * mouse-only control:
 *  - every region is a real `<button>` in a list beneath the map, so the whole
 *    picker is operable by keyboard and readable by a screen reader without the
 *    map at all — the map is the *illustration*, the buttons are the control;
 *  - the SVG paths are `aria-hidden` and click-through to the same handler, so
 *    a pointer user gets the map and nobody gets a worse experience;
 *  - selection is never conveyed by fill alone: the paired button carries
 *    `aria-pressed` and a visible state change.
 *
 * ── `readOnly` (Slice 11) ──
 * The seller profile's "areas (mini-map)" is a DISPLAY of 1-3 already-chosen
 * areas, not a picker — reusing this component rather than inventing a third
 * area-visualisation idiom keeps "a warm illustrated Trinidad" as one visual
 * idea across the browse-directory filter and the profile. In this mode the
 * sub-list shows only the seller's OWN areas (not all eight, which would be a
 * picker's worth of dead buttons on a display), as plain non-interactive
 * labels rather than `<button>`s — nothing here is a control.
 */

const FILL_SELECTED = "rgb(var(--teal))";
const FILL_HOVER = "rgb(var(--teal-soft))";
const FILL_IDLE = "rgb(var(--sunken))";
const STROKE = "rgb(var(--hairline))";

export interface RegionMapProps {
  selected: RegionKey[];
  /** Omit together with `readOnly` — a display has nothing to toggle. */
  onToggle?: (key: RegionKey) => void;
  /** Seller counts per area, shown on each button. */
  counts?: Record<string, number>;
  /** Slice 13 passes 3 (Part C's 1-3 rule); browse filtering has no cap. */
  max?: number;
  /** Display-only: the sub-list shows just `selected`, as plain labels. */
  readOnly?: boolean;
  className?: string;
}

export function RegionMap({ selected, onToggle, counts, max, readOnly = false, className }: RegionMapProps) {
  const t = useTranslations("regions");
  const [hovered, setHovered] = useState<RegionKey | null>(null);

  const atMax = max !== undefined && selected.length >= max;

  const fillFor = (key: RegionKey) => {
    if (selected.includes(key)) return FILL_SELECTED;
    if (hovered === key) return FILL_HOVER;
    return FILL_IDLE;
  };

  const handle = (key: RegionKey) => {
    if (readOnly || !onToggle) return;
    if (!selected.includes(key) && atMax) return;
    onToggle(key);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="rounded-card border border-hairline bg-card p-3">
        <svg viewBox={TT_VIEWBOX} className="h-auto w-full" aria-hidden focusable="false">
          {REGION_KEYS.map((key) => (
            <g
              key={key}
              onMouseEnter={() => !readOnly && setHovered(key)}
              onMouseLeave={() => !readOnly && setHovered(null)}
              onClick={() => handle(key)}
              className={cn("transition-[fill] duration-200 ease-soft", !readOnly && "cursor-pointer")}
            >
              {REGION_ADMIN_IDS[key].map((adminId) =>
                TT_ADMIN_PATHS[adminId] ? (
                  <path
                    key={adminId}
                    d={TT_ADMIN_PATHS[adminId]}
                    fill={fillFor(key)}
                    stroke={STROKE}
                    strokeWidth={1.5}
                  />
                ) : null,
              )}
            </g>
          ))}
        </svg>
      </div>

      {readOnly ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((key) => (
            <li key={key}>
              <span className="inline-flex items-center rounded-pill bg-teal-soft px-4 py-2 text-label font-medium text-ink">
                {t(key)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        // The actual control. Present at every width — this is not a
        // "small screens only" fallback.
        <ul className="flex flex-wrap gap-2">
          {REGION_KEYS.map((key) => {
            const isSelected = selected.includes(key);
            const count = counts?.[key] ?? 0;
            const disabled = !isSelected && atMax;

            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={disabled}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(key)}
                  onBlur={() => setHovered(null)}
                  onClick={() => handle(key)}
                  title={REGION_SUBAREAS[key].join(" · ")}
                  className={cn(
                    "tap-target flex items-center gap-2 rounded-pill px-4 text-label font-medium transition-colors duration-200 ease-soft disabled:opacity-50",
                    isSelected ? "bg-teal text-card" : "bg-sunken text-ink hover:bg-teal-soft",
                  )}
                >
                  {t(key)}
                  {counts && (
                    <span className={cn("text-caption", isSelected ? "text-card/90" : "text-ink")}>
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
