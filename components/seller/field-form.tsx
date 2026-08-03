"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SELLER_FORM_IDLE, type SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * The one save mechanism every profile field group uses, on both surfaces.
 *
 * The setup wizard and the profile editor are the SAME fields with different
 * chrome, so this component owns the whole of the difference between them:
 *
 *   - **wizard** (`nextHref` set) — "Continue" saves and advances; "Skip" is a
 *     plain link that advances WITHOUT saving. Skipping has to be a link rather
 *     than a submit, or a half-typed value would be persisted by the act of
 *     declining to fill the step in.
 *   - **editor** (`nextHref` null) — "Save", staying put, with a transient
 *     confirmation. No navigation at all.
 *
 * Architecture F2's "every step skippable-and-resumable" is therefore
 * structural: every step writes on Continue, so leaving at any point has
 * already saved everything entered up to that point, and `nextIncompleteStep`
 * reads it back out of the row on return.
 *
 * ⚠ `buildFormData` rather than an uncontrolled `<form>`: the interesting
 * fields here are multi-select controls (the region map, language and mode
 * toggles, a specialty chip list) whose value lives in React state, not in a
 * native form control. One serialiser per field group keeps that explicit.
 */
export interface FieldFormProps {
  action: (prev: SellerFormState, formData: FormData) => Promise<SellerFormState>;
  buildFormData: () => FormData;
  /** Wizard mode: where "Continue" and "Skip" go. Null in the editor. */
  nextHref?: string | null;
  /** Disables Continue while the field group is in an invalid local state. */
  disabled?: boolean;
  children: ReactNode;
}

export function FieldForm({
  action,
  buildFormData,
  nextHref = null,
  disabled = false,
  children,
}: FieldFormProps) {
  const t = useTranslations("seller");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SellerFormState>(SELLER_FORM_IDLE);

  const isWizard = nextHref !== null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = buildFormData();
    startTransition(async () => {
      const result = await action(SELLER_FORM_IDLE, formData);
      setState(result);
      if (result.status === "ok" && nextHref) router.push(nextHref);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {children}

      {state.status === "error" && (
        <p role="alert" className="text-label text-error">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || disabled}>
          {pending
            ? t("setup.saving")
            : isWizard
              ? t("setup.continue")
              : t("profile.save")}
        </Button>

        {isWizard && (
          <Button variant="ghost" asChild>
            {/* A real link, not a submit — skipping must not persist a
                half-filled field (see the component note). */}
            <a href={nextHref ?? "#"}>{t("setup.skip")}</a>
          </Button>
        )}

        {!isWizard && state.status === "ok" && !pending && (
          <span className="inline-flex items-center gap-1.5 text-label text-green">
            <Check aria-hidden className="size-4" />
            {t("profile.saved")}
          </span>
        )}
      </div>
    </form>
  );
}
