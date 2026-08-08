"use client";

import { User } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ComingSoonBadge } from "@/components/coming-soon";
import { accountInitial, type AccountSummary } from "@/lib/account-summary";
import { cn } from "@/lib/utils";

/**
 * A drop-in replacement for the plain `<User>` nav icon, for a SIGNED-IN
 * visitor only — the signed-out state keeps rendering the real `<User>` icon
 * inside the existing `<ComingSoon feature="buyerAccount">` sheet, untouched.
 *
 * The circle is a FIXED size per `size` preset, never merged with `className`
 * — deliberately a bit bigger (24px) than the ~16–20px glyphs it sits beside
 * in the header/bottom-nav, since a letter needs real room to stay legible,
 * and an avatar reading slightly larger than its sibling icons is a normal,
 * expected pattern (Gmail's own account circle does the same). `className`
 * only ever reaches the FALLBACK `<User>` icon, so it can match its siblings'
 * sizing exactly when no letter is available to show.
 */
export function AccountAvatarIcon({
  summary,
  className,
  size = "sm",
}: {
  summary: AccountSummary;
  className?: string;
  size?: "sm" | "lg";
}) {
  const initial = accountInitial(summary);
  if (!initial) {
    return <User aria-hidden className={className} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-pill bg-green font-semibold text-card",
        size === "lg" ? "h-12 w-12 text-h2" : "h-6 w-6 text-caption",
      )}
    >
      {initial}
    </span>
  );
}

/**
 * The real "who am I" sheet for a signed-in visitor — Tier 3 of the
 * account-indicator feature (Slice 21, found needed while onboarding/demo
 * testing: there was no way to tell who, or what capacity, a session was in).
 *
 * ⚠ Client/Provider are shown as ONE OR the other, never both, even though the
 * underlying capabilities are NOT mutually exclusive (an active seller can
 * also browse/order as a buyer — no architectural clash). "Client" here means
 * the *implicit default* state for any signed-in non-provider, not a real
 * `(FOOD, CLIENT)` membership check — that membership is minted lazily on a
 * buyer's first save/follow/order, so a brand-new signed-in visitor would
 * otherwise show no badge at all. Showing "Provider" alone for a confirmed
 * active seller keeps the common case unambiguous rather than redundant.
 * Admin is a real, independent, always-separate badge (a different axis
 * entirely — global role, not Food standing).
 */
export function AccountModal({ summary, children }: { summary: AccountSummary; children: React.ReactNode }) {
  const t = useTranslations("account");
  const tc = useTranslations("common");

  return (
    <BottomSheet>
      <BottomSheetTrigger asChild>{children}</BottomSheetTrigger>
      <BottomSheetContent title={t("title")}>
        <div className="flex items-center gap-3">
          <AccountAvatarIcon summary={summary} size="lg" />
          <div className="flex min-w-0 flex-col">
            {summary.name && (
              <p className="truncate text-body font-semibold text-ink">{summary.name}</p>
            )}
            <p className="truncate text-label text-ink-muted">{summary.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip variant="neutral">{summary.isProvider ? t("badges.provider") : t("badges.client")}</Chip>
          {summary.isAdmin && <Chip variant="neutral">{t("badges.admin")}</Chip>}
        </div>

        {/*
         * This modal is deliberately a summary, not the full account-
         * management page `<PlaceholderPage>` used to promise (addresses,
         * language, notification settings) — that's still real, unbuilt Phase
         * 4 scope. Replacing the old stub with this one silently dropped the
         * only place that said so, which is exactly what prompted this note:
         * carrying the SAME "more is coming" context forward rather than
         * letting a signed-in visitor assume this modal is the whole feature.
         */}
        <div className="flex flex-col gap-1 rounded-card bg-sunken p-4">
          <div className="flex items-center gap-2">
            <ComingSoonBadge />
            <p className="text-label font-medium text-ink">{t("moreComingTitle")}</p>
          </div>
          <p className="text-caption text-ink-muted">{t("moreComingBody")}</p>
        </div>

        <BottomSheetFooter>
          <BottomSheetClose asChild>
            <Button variant="primary" size="lg">
              {tc("close")}
            </Button>
          </BottomSheetClose>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
