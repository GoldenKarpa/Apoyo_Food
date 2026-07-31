"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { FilterSheet, type FilterSelection } from "@/components/filters/filter-sheet";

/**
 * A live `<FilterSheet>` with Slice 9's real group shape, so the sheet's draft/
 * apply behaviour and its pill toggles can be exercised (and measured) before
 * browse exists to host it. The applied selection is echoed back on the page —
 * without it, "Apply worked" would be unfalsifiable from the outside.
 */
export function FilterDemo() {
  const t = useTranslations("filters");
  const ta = useTranslations("availability");
  const ts = useTranslations("styleGuide.samples");
  const [applied, setApplied] = React.useState<FilterSelection>({});

  const groups = [
    {
      key: "category",
      label: t("groups.category"),
      mode: "multi" as const,
      options: [
        { value: "dinner", label: ts("categoryOne") },
        { value: "desserts", label: ts("categoryTwo") },
        { value: "juices-smoothies", label: ts("categoryThree") },
        { value: "holiday-specials", label: ts("categoryFour") },
      ],
    },
    {
      key: "area",
      label: t("groups.area"),
      mode: "multi" as const,
      options: [
        { value: "south_west", label: ts("areaOne") },
        { value: "central", label: ts("areaTwo") },
      ],
    },
    {
      key: "availability",
      label: t("groups.availability"),
      mode: "single" as const,
      options: [
        { value: "today", label: ta("today") },
        { value: "weekend", label: ta("weekend") },
        { value: "preorder", label: ta("preorder") },
      ],
    },
  ];

  const summary = Object.entries(applied)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => `${key}: ${values.join(", ")}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <div>
        <FilterSheet groups={groups} value={applied} onApply={setApplied} />
      </div>
      <p data-testid="filter-summary" className="text-label text-ink">
        {summary || "—"}
      </p>
    </div>
  );
}
