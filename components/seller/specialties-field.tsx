"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import { FieldForm } from "@/components/seller/field-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSellerSpecialties } from "@/lib/actions/update-seller-profile";
import { MAX_SPECIALTIES, MAX_SPECIALTY_LENGTH } from "@/lib/seller-profile";

/**
 * Free-text specialty tags ("pastelón", "black cake", "doubles").
 *
 * ⚠ Free text, not a fixed vocabulary, and that is a product decision rather
 * than a shortcut: architecture open question 4 leaves Trini-specific taxonomy
 * to community input, and Part E3's whole search design (unaccent + trigram)
 * exists because Trinidad spells its own dishes several ways. A dropdown would
 * quietly tell a cook their dish is not on the menu.
 *
 * Chips are added on Enter as well as by the button — typing a list and pressing
 * Enter is what a phone keyboard invites, and swallowing that keypress into a
 * form submit would lose the word.
 */
export function SpecialtiesField({
  initial,
  nextHref,
}: {
  initial: string[];
  nextHref?: string | null;
}) {
  const t = useTranslations("seller");
  const [specialties, setSpecialties] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  const isFull = specialties.length >= MAX_SPECIALTIES;

  function add() {
    const value = draft.trim().slice(0, MAX_SPECIALTY_LENGTH);
    if (!value || isFull) return;
    // Case-insensitive duplicate check: "Pastelón" and "pastelón" are the same
    // specialty to every reader, and two of them on a profile reads as sloppy.
    if (specialties.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    setSpecialties((current) => [...current, value]);
    setDraft("");
  }

  return (
    <FieldForm
      action={updateSellerSpecialties}
      nextHref={nextHref}
      buildFormData={() => {
        const fd = new FormData();
        for (const specialty of specialties) fd.append("specialties", specialty);
        return fd;
      }}
    >
      <div className="flex flex-col gap-3">
        <Label htmlFor="seller-specialty">{t("fields.specialtiesLabel")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="seller-specialty"
            value={draft}
            maxLength={MAX_SPECIALTY_LENGTH}
            disabled={isFull}
            placeholder={t("fields.specialtiesPlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Otherwise Enter submits the surrounding form and the word is
                // lost — the exact keypress a phone keyboard suggests.
                e.preventDefault();
                add();
              }
            }}
            className="max-w-xs"
          />
          <Button type="button" variant="secondary" onClick={add} disabled={isFull || !draft.trim()}>
            <Plus aria-hidden className="size-4" />
            {t("fields.specialtiesAdd")}
          </Button>
        </div>

        {specialties.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {specialties.map((specialty) => (
              <li key={specialty}>
                <button
                  type="button"
                  onClick={() => setSpecialties((c) => c.filter((s) => s !== specialty))}
                  aria-label={t("fields.specialtiesRemove", { name: specialty })}
                  className="tap-target inline-flex items-center gap-2 rounded-pill bg-terracotta-soft px-4 text-label font-medium text-ink transition-colors duration-200 ease-soft hover:bg-terracotta hover:text-card"
                >
                  {specialty}
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-caption text-ink" aria-live="polite">
          {t("fields.specialtiesCount", { count: specialties.length, max: MAX_SPECIALTIES })}
        </p>
      </div>
    </FieldForm>
  );
}
