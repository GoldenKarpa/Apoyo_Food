"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RegionKey } from "@prisma/client";

import { FieldForm } from "@/components/seller/field-form";
import { RegionMap } from "@/components/region-map";
import { updateSellerAreas } from "@/lib/actions/update-seller-profile";
import { MAX_SELLER_AREAS } from "@/lib/seller-profile";

/**
 * Service areas — 1 to 3 (architecture Part C).
 *
 * ⚠ Reuses `<RegionMap>` through its `max` prop, which Slice 9 added *for this
 * step* and nothing has used until now. The same illustrated Trinidad is the
 * buyer's browse filter (Slice 9), the seller's picker (here) and the profile's
 * read-only mini-map (Slice 11's `readOnly` mode) — one visual idea, three
 * roles, rather than three area widgets that drift apart. It is also fully
 * keyboard-operable without the SVG, because the real control is the button
 * list beneath it.
 *
 * ⚠ **Areas are the ONLY location this product ever exposes** (Part G). There
 * is no address field on this form, on the profile editor, or on the
 * `FoodSeller` table — pickup means a buyer visiting a home kitchen, and the
 * exact place is exchanged inside an accepted order's thread (Slice 18). A
 * region is as fine-grained as a public surface is ever allowed to get.
 */
export function AreasField({
  initial,
  nextHref,
}: {
  initial: RegionKey[];
  nextHref?: string | null;
}) {
  const t = useTranslations("seller");
  const [areas, setAreas] = useState<RegionKey[]>(initial);

  return (
    <FieldForm
      action={updateSellerAreas}
      nextHref={nextHref}
      buildFormData={() => {
        const fd = new FormData();
        for (const area of areas) fd.append("areas", area);
        return fd;
      }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-label text-ink">
          {t("fields.areasHint", { max: MAX_SELLER_AREAS })}
        </p>
        <RegionMap
          selected={areas}
          max={MAX_SELLER_AREAS}
          onToggle={(key) =>
            setAreas((current) =>
              current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
            )
          }
        />
        <p className="text-caption text-ink" aria-live="polite">
          {t("fields.areasCount", { count: areas.length, max: MAX_SELLER_AREAS })}
        </p>
      </div>
    </FieldForm>
  );
}
