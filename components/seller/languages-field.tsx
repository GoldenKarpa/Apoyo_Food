"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { FieldForm } from "@/components/seller/field-form";
import { ToggleList } from "@/components/seller/toggle-list";
import { updateSellerLanguages } from "@/lib/actions/update-seller-profile";
import { SELLER_LANGUAGES } from "@/lib/seller-profile";

/**
 * Which languages this cook can be reached in.
 *
 * Not cosmetic on this product: Part E6 exists because many sellers are
 * Spanish-first and many buyers English-first, and this is the field that lets
 * a buyer see that before committing to an order they will have to talk
 * through. Slice 18's order thread carries the automatic translation; this
 * carries the expectation.
 */
export function LanguagesField({
  initial,
  nextHref,
}: {
  initial: string[];
  nextHref?: string | null;
}) {
  const t = useTranslations("seller");
  const tl = useTranslations("seller.languages");
  const [languages, setLanguages] = useState<string[]>(initial);

  return (
    <FieldForm
      action={updateSellerLanguages}
      nextHref={nextHref}
      buildFormData={() => {
        const fd = new FormData();
        for (const language of languages) fd.append("languages", language);
        return fd;
      }}
    >
      <ToggleList
        legend={t("fields.languagesLabel")}
        options={SELLER_LANGUAGES.map((code) => ({ value: code, label: tl(code) }))}
        selected={languages}
        onToggle={(value) =>
          setLanguages((current) =>
            current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
          )
        }
      />
    </FieldForm>
  );
}
