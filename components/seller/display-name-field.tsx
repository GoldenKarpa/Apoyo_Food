"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { FieldForm } from "@/components/seller/field-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSellerDisplayName } from "@/lib/actions/update-seller-profile";
import { MAX_DISPLAY_NAME_LENGTH, MIN_DISPLAY_NAME_LENGTH } from "@/lib/seller-profile";

/**
 * Renaming the kitchen. Editor-only — registration already captured the name,
 * and asking for it again as a wizard step would be a step with nothing to do.
 *
 * ⚠ The slug does NOT follow a rename (see `lib/actions/update-seller-profile.ts`).
 */
export function DisplayNameField({ initial }: { initial: string }) {
  const t = useTranslations("seller.fields");
  const [displayName, setDisplayName] = useState(initial);

  return (
    <FieldForm
      action={updateSellerDisplayName}
      disabled={displayName.trim().length < MIN_DISPLAY_NAME_LENGTH}
      buildFormData={() => {
        const fd = new FormData();
        fd.set("displayName", displayName);
        return fd;
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="seller-name">{t("displayNameLabel")}</Label>
        <Input
          id="seller-name"
          name="displayName"
          value={displayName}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          onChange={(e) => setDisplayName(e.target.value)}
          className="max-w-md"
        />
        <p className="text-caption text-ink">{t("displayNameSlugNote")}</p>
      </div>
    </FieldForm>
  );
}
