"use client";

import * as React from "react";
import {
  BarChart3,
  ChefHat,
  MessageSquare,
  Receipt,
  User,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet";
import { Button, type ButtonProps } from "@/components/ui/button";
import { COMING_SOON_FEATURES, type ComingSoonFeature, type FeatureIcon } from "@/lib/coming-soon";
import { cn } from "@/lib/utils";

/**
 * An unbuilt action opens a modal that explains the planned feature — never a
 * dead link, a disabled control, a silent no-op or a missing nav item
 * (BUILD_SLICES.md conventions; the 2026-07-28 "visual demo" ruling).
 *
 * ── Usage: the one-line contract ──
 *   Self-rendering (the common case) — ONE line, and deleting that one line is
 *   how the real feature replaces it:
 *       <ComingSoon feature="messageSeller" />
 *
 *   Wrapping a control whose own styling matters (a sticky CTA bar, a nav item):
 *       <ComingSoon feature="buyerAccount" asChild>
 *         <button className="…">…</button>
 *       </ComingSoon>
 *
 * `feature` is typed against `lib/coming-soon.ts`, so a typo is a compile error
 * rather than a modal rendering an empty title in front of a demo audience.
 */

const ICONS: Record<FeatureIcon, LucideIcon> = {
  utensils: UtensilsCrossed,
  message: MessageSquare,
  receipt: Receipt,
  user: User,
  chefHat: ChefHat,
  chart: BarChart3,
};

/**
 * The small "Próximamente / Coming soon" pill.
 *
 * Exported because a stub often reads better when the *trigger* already says so
 * rather than only revealing it after a tap. `gold-soft` with ink measures
 * 11.6:1 — a soft tint, deliberately not `gold-vivid`, which is reserved for
 * status chips (Part F3) and would read as an order state here.
 */
export function ComingSoonBadge({ className }: { className?: string }) {
  const t = useTranslations("comingSoon");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill bg-gold-soft px-2 py-0.5 text-caption font-medium text-ink",
        className,
      )}
    >
      {t("badge")}
    </span>
  );
}

export interface ComingSoonProps {
  feature: ComingSoonFeature;
  /** Use the child element as the trigger instead of the default button. */
  asChild?: boolean;
  children?: React.ReactNode;
  /** Default-trigger styling only; ignored when `asChild`. */
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /** Show the "Coming soon" pill inside the default trigger. */
  badge?: boolean;
  className?: string;
  /** Fires when the sheet opens. Slice 9's demand logging can hang intent here. */
  onOpen?: () => void;
}

export function ComingSoon({
  feature,
  asChild = false,
  children,
  variant = "outline",
  size,
  badge = false,
  className,
  onOpen,
}: ComingSoonProps) {
  const t = useTranslations("comingSoon");
  const entry = COMING_SOON_FEATURES[feature];
  const Icon = ICONS[entry.icon];

  // Firing on open rather than on close keeps any intent signal true even when
  // the viewer dismisses with Escape.
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) onOpen?.();
    },
    [onOpen],
  );

  return (
    <BottomSheet onOpenChange={handleOpenChange}>
      {/*
        `asChild` is ALWAYS on, in both branches. Radix's Trigger renders its own
        <button> unless told to merge into its child, so passing a <Button> as a
        plain child nests a button inside a button — invalid HTML the parser
        silently restructures, which broke hydration for entire pages in
        Apparel's equivalent slice (React #418). One element, always merged.

        `data-coming-soon` marks a stub in the rendered DOM, so Slice 19's
        "every Phase-1 stub has been replaced" check can be run against a
        rendered page rather than only against the registry.
      */}
      <BottomSheetTrigger asChild>
        {asChild ? (
          children
        ) : (
          <Button variant={variant} size={size} className={className} data-coming-soon={feature}>
            {t(`features.${feature}.action`)}
            {badge && <ComingSoonBadge />}
          </Button>
        )}
      </BottomSheetTrigger>

      <BottomSheetContent
        title={t(`features.${feature}.title`)}
        description={t(`features.${feature}.description`)}
      >
        <div className="flex items-center gap-3 rounded-card bg-sunken p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-green-soft text-ink">
            <Icon aria-hidden className="h-5 w-5" />
          </span>
          {/* Full `ink`, not `ink-muted` — this sits on `sunken`, where
              ink-muted measures 4.37:1 (the Slice 1 finding). */}
          <p className="text-label text-ink">{t("phaseNote", { phase: entry.phase })}</p>
        </div>

        <BottomSheetFooter>
          <BottomSheetClose asChild>
            <Button variant="primary" size="lg">
              {t("acknowledge")}
            </Button>
          </BottomSheetClose>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
