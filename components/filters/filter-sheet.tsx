"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

/**
 * The filter bottom sheet **shell** (architecture Part F3: "filter UIs as bottom
 * sheets, not sidebars"). Slice 9 supplies the real groups — category, area,
 * price band, dietary, availability, sort — and lifts the result into URL
 * params so a filtered browse is a shareable link.
 *
 * ── Draft state, applied on Apply ──
 * Selections mutate a local draft and only reach `onApply` when the viewer taps
 * Apply; dismissing the sheet discards them. That is the behaviour a bottom
 * sheet implies, and it also means Slice 9 performs **one** navigation per
 * filter session rather than one per pill tap — which matters because every
 * browse navigation writes a `FoodDemandEvent` (Part E3), and per-tap events
 * would turn one person's indecision into a demand signal.
 *
 * ── Single vs multi select is per group ──
 * `mode: "single"` for sort and price band (choosing one replaces the other),
 * `"multi"` for category, area and dietary. Encoding it per group here is what
 * keeps Slice 9 from having to reimplement toggle semantics five times.
 *
 * The trigger and every pill clear ≥44px in both directions; `<Chip size="md">`
 * carries `.tap-target` for exactly that.
 */
export interface FilterOption {
  value: string;
  /** Already-localized. */
  label: string;
}

export interface FilterGroup {
  key: string;
  /** Already-localized group heading. */
  label: string;
  mode: "single" | "multi";
  options: FilterOption[];
}

export type FilterSelection = Record<string, string[]>;

export interface FilterSheetProps {
  groups: FilterGroup[];
  /** Currently applied selection (Slice 9: parsed from the URL). */
  value?: FilterSelection;
  onApply?: (selection: FilterSelection) => void;
  /** Extra trigger classes — the browse toolbar positions it. */
  className?: string;
}

function toggle(current: string[], value: string, mode: FilterGroup["mode"]): string[] {
  if (mode === "single") return current[0] === value ? [] : [value];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function FilterSheet({ groups, value = {}, onApply, className }: FilterSheetProps) {
  const t = useTranslations("filters");
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<FilterSelection>(value);

  // Re-seed the draft whenever the sheet opens, so a discarded session cannot
  // leak into the next one and a URL change made elsewhere is picked up.
  React.useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeCount = Object.values(value).reduce((sum, values) => sum + values.length, 0);

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger asChild>
        <Button variant="outline" className={cn("gap-2", className)}>
          <SlidersHorizontal aria-hidden />
          {t("open")}
          {activeCount > 0 && (
            <span className="rounded-pill bg-green px-2 py-0.5 text-caption font-medium text-card">
              {activeCount}
            </span>
          )}
        </Button>
      </BottomSheetTrigger>

      <BottomSheetContent title={t("title")} description={t("description")}>
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const selected = draft[group.key] ?? [];
            return (
              <fieldset key={group.key} className="flex flex-col gap-3">
                <legend className="text-label font-medium text-ink">{group.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const isSelected = selected.includes(option.value);
                    return (
                      <Chip
                        key={option.value}
                        asChild
                        variant={isSelected ? "selected" : "neutral"}
                        size="md"
                      >
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              [group.key]: toggle(prev[group.key] ?? [], option.value, group.mode),
                            }))
                          }
                        >
                          {option.label}
                        </button>
                      </Chip>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <BottomSheetFooter>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              onApply?.(draft);
              setOpen(false);
            }}
          >
            {t("apply")}
          </Button>
          <Button variant="ghost" size="md" onClick={() => setDraft({})}>
            {t("clear")}
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
