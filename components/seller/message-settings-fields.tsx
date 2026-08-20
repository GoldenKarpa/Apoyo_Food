"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  NOTIFICATION_DELIVERIES,
  type NotificationDelivery,
} from "@/lib/notification-prefs";
import { useFoodActions } from "@/lib/actions/registry";

/**
 * PC-1 — the seller's conversation settings, on `/food/profile`.
 *
 * Flips immediately, no "Save" — the same shape as `<ListingActiveToggle>`, for
 * the same reason: a one-thing-on-or-off control that needs a save button is a
 * control people leave in the wrong state.
 *
 * ⚠ Every switch here is rendered ON by default because the stored default is
 * on (schema + `lib/notification-prefs.ts`). A seller arriving at this page for
 * the first time is looking at their real, already-active state — not at an
 * unsaved form whose defaults happen to match.
 */

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-label font-medium text-ink">{title}</p>
        <p className="text-caption text-ink-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function MessageSettingsFields({
  postOrderMessaging,
  messageReadReceipts,
  chatDelivery,
}: {
  postOrderMessaging: boolean;
  messageReadReceipts: boolean;
  chatDelivery: NotificationDelivery;
}) {
  const t = useTranslations("seller.messageSettings");
  const router = useRouter();
  const actions = useFoodActions();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <Row title={t("postOrder.title")} description={t("postOrder.description")}>
        <Switch
          checked={postOrderMessaging}
          disabled={pending}
          label={t("postOrder.title")}
          onCheckedChange={(next) =>
            startTransition(async () => {
              await actions.setPostOrderMessaging(next);
              router.refresh();
            })
          }
        />
      </Row>

      <Row title={t("readReceipts.title")} description={t("readReceipts.description")}>
        <Switch
          checked={messageReadReceipts}
          disabled={pending}
          label={t("readReceipts.title")}
          onCheckedChange={(next) =>
            startTransition(async () => {
              await actions.setMessageReadReceipts(next);
              router.refresh();
            })
          }
        />
      </Row>

      <div className="flex flex-col gap-2">
        <p className="text-label font-medium text-ink">{t("delivery.title")}</p>
        <p className="text-caption text-ink-muted">{t("delivery.description")}</p>
        {/* A radio group, not a switch: three states, exactly one of which is
            true, and a screen reader should hear it as a choice from a set. */}
        <div role="radiogroup" aria-label={t("delivery.title")} className="mt-1 flex flex-wrap gap-2">
          {NOTIFICATION_DELIVERIES.map((option) => {
            const selected = option === chatDelivery;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await actions.setChatNotificationDelivery(option);
                    router.refresh();
                  })
                }
                className={cn(
                  "tap-target rounded-pill px-4 text-label transition-colors duration-200 ease-soft disabled:opacity-50",
                  selected ? "bg-green text-card" : "bg-sunken text-ink hover:bg-hairline",
                )}
              >
                {t(`delivery.options.${option}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
