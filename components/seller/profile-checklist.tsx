import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check, Circle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SetupStepStatus } from "@/lib/seller-profile";

/**
 * The dashboard's "what's left" panel — the empty state that points at a next
 * action rather than describing an absence.
 *
 * Reads `lib/seller-profile.ts`'s completion model, the same source the wizard
 * resumes from, so the dashboard and the wizard can never disagree about what
 * is outstanding.
 *
 * ⚠ `required` here is ADVISORY. Slice 16 owns the PENDING -> ACTIVE gate and is
 * the only thing that actually enforces anything; this panel exists so a seller
 * waiting in that queue can see what an approver will be looking for instead of
 * waiting on an invisible standard.
 */
export async function ProfileChecklist({
  steps,
  percent,
}: {
  steps: SetupStepStatus[];
  percent: number;
}) {
  const t = await getTranslations("seller");
  const remaining = steps.filter((s) => !s.done);

  return (
    <section className="rounded-card border border-hairline bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-h2 font-semibold text-ink">{t("checklist.title")}</h2>
        <p className="text-caption text-ink">{t("setup.percentComplete", { percent })}</p>
      </div>

      <p className="mt-2 max-w-prose text-label text-ink">
        {remaining.length === 0 ? t("checklist.complete") : t("checklist.body")}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={`/food/profile/setup?step=${step.key}`}
              className={cn(
                "flex min-h-[44px] items-center gap-3 rounded-control px-3 py-2 text-label transition-colors duration-200 ease-soft hover:bg-sunken",
                step.done ? "text-ink" : "font-medium text-ink",
              )}
            >
              {step.done ? (
                <Check aria-hidden className="size-4 shrink-0 text-green" />
              ) : (
                <Circle aria-hidden className="size-4 shrink-0 text-ink" />
              )}
              <span>{t(`setup.steps.${step.key}.title`)}</span>
              <span className="sr-only">
                {step.done ? t("setup.stepDone") : t("setup.stepTodo")}
              </span>
              {!step.done && step.required && (
                <span className="ml-auto rounded-pill bg-gold-vivid px-3 py-1 text-caption font-medium text-ink">
                  {t("checklist.required")}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
