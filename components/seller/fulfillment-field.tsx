"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { FieldForm } from "@/components/seller/field-form";
import { ToggleList } from "@/components/seller/toggle-list";
import { updateSellerFulfillment } from "@/lib/actions/update-seller-profile";
import { FULFILLMENT_MODES } from "@/lib/seller-profile";

/**
 * How food actually changes hands (Part D's `FulfillmentMode`).
 *
 * ⚠ The hints deliberately say what each mode means for PRIVACY, because that
 * is the part a first-time seller has not thought about: choosing PICKUP means
 * agreeing to buyers coming to a home kitchen. Part G's rule still holds either
 * way — no address is stored or displayed anywhere, and the exact place is
 * exchanged only inside an accepted order's thread — but a seller should know
 * what they are offering before they offer it, not discover it at the first
 * order. Slice 17 validates a request against these modes.
 */
export function FulfillmentField({
  initial,
  nextHref,
}: {
  initial: string[];
  nextHref?: string | null;
}) {
  const t = useTranslations("seller");
  const tm = useTranslations("fulfillmentModes");
  const th = useTranslations("seller.fulfillmentHints");
  const [modes, setModes] = useState<string[]>(initial);

  return (
    <FieldForm
      action={updateSellerFulfillment}
      nextHref={nextHref}
      buildFormData={() => {
        const fd = new FormData();
        for (const mode of modes) fd.append("fulfillmentModes", mode);
        return fd;
      }}
    >
      <ToggleList
        legend={t("fields.fulfillmentLabel")}
        options={FULFILLMENT_MODES.map((mode) => ({
          value: mode,
          label: tm(mode),
          hint: th(mode),
        }))}
        selected={modes}
        onToggle={(value) =>
          setModes((current) =>
            current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
          )
        }
      />
      <ul className="flex flex-col gap-1">
        {FULFILLMENT_MODES.map((mode) => (
          <li key={mode} className="text-caption text-ink">
            <span className="font-medium">{tm(mode)}</span> — {th(mode)}
          </li>
        ))}
      </ul>
    </FieldForm>
  );
}
