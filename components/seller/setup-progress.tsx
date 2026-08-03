import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { SETUP_STEPS, type SetupStepKey, type SetupStepStatus } from "@/lib/seller-profile";

/**
 * The wizard's own wayfinding: how far along, and jump to any step.
 *
 * ⚠ Every step is REACHABLE from here, not just the next one. A guided flow
 * that can only be walked forwards is not resumable in any useful sense — a
 * seller who skipped their cover photo in the first session has to be able to
 * come back to exactly that step, and architecture F2 asks for skippable AND
 * resumable, which are two different properties. `nextIncompleteStep` decides
 * where the flow *lands*; this decides where it can *go*.
 *
 * The progress bar is presentational (`aria-hidden`); the same information is
 * carried by the step list, where each item states done/not-done in text via
 * `aria-current` and a visually-hidden label rather than by colour alone.
 */
export async function SetupProgress({
  steps,
  current,
  percent,
}: {
  steps: SetupStepStatus[];
  current: SetupStepKey;
  percent: number;
}) {
  const t = await getTranslations("seller");
  const position = SETUP_STEPS.indexOf(current) + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-label font-medium text-ink">
          {t("setup.stepOf", { position, total: SETUP_STEPS.length })}
        </p>
        <p className="text-caption text-ink">{t("setup.percentComplete", { percent })}</p>
      </div>

      <div aria-hidden className="h-2 w-full overflow-hidden rounded-pill bg-sunken">
        <div
          className="h-full rounded-pill bg-green transition-[width] duration-300 ease-soft"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="flex flex-wrap gap-2">
        {steps.map((step) => {
          const isCurrent = step.key === current;
          return (
            <li key={step.key}>
              <Link
                href={`/food/profile/setup?step=${step.key}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "tap-target inline-flex items-center gap-1.5 rounded-pill px-4 text-caption font-medium transition-colors duration-200 ease-soft",
                  isCurrent
                    ? "bg-green text-card"
                    : step.done
                      ? "bg-green-soft text-ink"
                      : "bg-sunken text-ink hover:bg-green-soft",
                )}
              >
                {step.done && <Check aria-hidden className="size-3.5" />}
                {t(`setup.steps.${step.key}.title`)}
                <span className="sr-only">
                  {step.done ? t("setup.stepDone") : t("setup.stepTodo")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
