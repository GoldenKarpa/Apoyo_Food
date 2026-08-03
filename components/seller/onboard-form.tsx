"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { onboardSeller } from "@/lib/actions/onboard-seller";
import { SELLER_FORM_IDLE, type SellerFormState } from "@/lib/actions/seller-form-state";
import { MAX_DISPLAY_NAME_LENGTH, MIN_DISPLAY_NAME_LENGTH } from "@/lib/seller-profile";

/**
 * Seller registration — deliberately ONE field.
 *
 * Everything else a profile needs is a step of the guided setup that follows,
 * because architecture F2's rule for this flow is "every step
 * skippable-and-resumable — never force completeness before value". A long
 * registration form is the opposite: it demands completeness *before* anything
 * of value exists, and it is where a first-time seller on a phone gives up.
 *
 * The name is required because it is the only thing that cannot be deferred:
 * `slug` is derived from it (once, never rotated — lib/slug.ts), and a kitchen
 * with no name has no URL a buyer could ever be sent to.
 */
export function OnboardForm() {
  const t = useTranslations("seller.onboarding");
  const te = useTranslations("seller.errors");
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [state, setState] = useState<SellerFormState>(SELLER_FORM_IDLE);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("displayName", displayName);
    startTransition(async () => {
      const result = await onboardSeller(SELLER_FORM_IDLE, formData);
      setState(result);
      // Straight into the guided setup — the seller row now exists, so every
      // step from here is an edit of something real and is resumable.
      if (result.status === "ok") router.push("/food/profile/setup");
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="seller-display-name">{t("displayNameLabel")}</Label>
        <Input
          id="seller-display-name"
          name="displayName"
          value={displayName}
          required
          minLength={MIN_DISPLAY_NAME_LENGTH}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          placeholder={t("displayNamePlaceholder")}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <p className="text-caption text-ink">{t("displayNameHint")}</p>
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-label text-error">
          {te(state.error)}
        </p>
      )}

      <div>
        <Button type="submit" size="lg" disabled={pending || displayName.trim().length < MIN_DISPLAY_NAME_LENGTH}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
