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
 */

const FILL_SELECTED = "rgb(var(--teal))";
const FILL_HOVER = "rgb(var(--teal-soft))";
const FILL_IDLE = "rgb(var(--sunken))";
const STROKE = "rgb(var(--hairline))";

export interface RegionMapProps {
  selected: RegionKey[];
  onToggle: (key: RegionKey) => void;
  /** Seller counts per area, shown on each button. */
  counts?: Record<string, number>;
  /** Slice 13 passes 3 (Part C's 1-3 rule); browse filtering has no cap. */
  max?: number;
  className?: string;
}

export function RegionMap({ selected, onToggle, counts, max, className }: RegionMapProps) {
  const t = useTranslations("regions");
  const [hovered, setHovered] = useState<RegionKey | null>(null);

  const atMax = max !== undefined && selected.length >= max;

  const fillFor = (key: RegionKey) => {
    if (selected.includes(key)) return FILL_SELECTED;
    if (hovered === key) return FILL_HOVER;
    return FILL_IDLE;
  };

  const handle = (key: RegionKey) => {
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
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handle(key)}
              className="cursor-pointer transition-[fill] duration-200 ease-soft"
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

      {/* The actual control. Present at every width — this is not a
          "small screens only" fallback. */}
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
    </div>
  );
}
