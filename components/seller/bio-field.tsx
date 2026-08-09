"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { FieldForm } from "@/components/seller/field-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateSellerBio } from "@/lib/actions/update-seller-profile";
import { MAX_BIO_LENGTH, MIN_BIO_LENGTH } from "@/lib/seller-profile";

/**
 * The kitchen's story.
 *
 * ⚠ Authored ONCE, in the cook's own language — deliberately not stored as a
 * bilingual pair. Part D has no translation columns on a seller or a listing,
 * and Slice 5 recorded why: Part E3 bridges languages at DISCOVERY (unaccent +
 * trigram matching), not by asking a Spanish-speaking cook to write everything
 * twice. Slice 8's seed follows the same rule — 14 Spanish-authored listings
 * with no English twin.
 */
export function BioField({ initial, nextHref }: { initial: string; nextHref?: string | null }) {
  const t = useTranslations("seller");
  const [bio, setBio] = useState(initial);

  return (
    <FieldForm
      action={updateSellerBio}
      nextHref={nextHref}
      buildFormData={() => {
        const fd = new FormData();
        fd.set("bio", bio);
        return fd;
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="seller-bio">{t("fields.bioLabel")}</Label>
        <Textarea
          id="seller-bio"
          name="bio"
          value={bio}
          maxLength={MAX_BIO_LENGTH}
          placeholder={t("fields.bioPlaceholder")}
          onChange={(e) => setBio(e.target.value)}
        />
        <p className="text-caption text-ink" aria-live="polite">
          {t("fields.bioCount", { count: bio.length, max: MAX_BIO_LENGTH })}
        </p>
        {/* Found live 2026-08-09: a bio under MIN_BIO_LENGTH silently never
            ticks the setup checklist and silently blocks admin approval —
            "silently" being the actual bug. The max is always visible above;
            this is the matching hint for the floor, shown only while it isn't
            yet met (never scolds a seller who has already cleared it). */}
        {bio.trim().length < MIN_BIO_LENGTH && (
          <p className="text-caption text-ink-muted">
            {t("fields.bioMinHint", { min: MIN_BIO_LENGTH })}
          </p>
        )}
      </div>
    </FieldForm>
  );
}
