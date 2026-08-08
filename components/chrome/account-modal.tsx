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
import { Chip, StatusChip } from "@/components/ui/chip";
import { ComingSoonBadge } from "@/components/coming-soon";
import { accountInitial, type AccountSummary, type OtherProviderVertical } from "@/lib/account-summary";
import { cn } from "@/lib/utils";

/** Display names for the badge row — proper nouns, deliberately identical across locales (the same convention "Apoyo Food" itself already gets in the Spanish footer copy). */
const VERTICAL_LABELS: Record<"FOOD" | OtherProviderVertical, string> = {
  FOOD: "Food",
  APPAREL: "Apparel",
  SALON: "Salon",
  SOCIAL: "Social",
};

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
 * Slice 22 extended this to a cross-vertical badge row, found needed the same
 * way: a real account surfaced with an ACTIVE `(FOOD, PROVIDER)` ecosystem
 * membership but no local `FoodSeller` row, and the old binary Client/Provider
 * check silently mislabeled it "Client" — indistinguishable from an ordinary
 * buyer. Badge rules, worked out with the user directly, not assumed:
 *  - Food's OWN standing gets exactly one badge: "Food · Provider" (fully
 *    active), "Food · Setup pending" (ecosystem membership without a local
 *    row — the case above), or plain "Client" (Food's implicit default for
 *    everyone else — not a real `(FOOD, CLIENT)` membership check, since that
 *    membership is minted lazily on a buyer's first save/follow/order).
 *  - Every OTHER vertical (Apparel, Salon, Social — DEMIA deliberately
 *    excluded, kept off this surface) gets a Provider chip ONLY, never a
 *    Client chip: "Client" is an unearned default everywhere, not worth
 *    surfacing for a vertical the visitor isn't even on; "Provider" is a real,
 *    opt-in achievement worth showing regardless of which vertical's own
 *    interface is currently open. There is no `_pending` state for these —
 *    Food has no visibility into another vertical's own local onboarding
 *    completion, only its ecosystem membership.
 *  - Admin is a real, independent, always-separate badge (a different axis
 *    entirely — global role, not vertical standing).
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
          {summary.foodStatus === "provider" && (
            <Chip variant="neutral">{t("badges.providerOf", { vertical: VERTICAL_LABELS.FOOD })}</Chip>
          )}
          {summary.foodStatus === "provider_pending" && (
            <StatusChip tone="pending">
              {t("badges.providerPending", { vertical: VERTICAL_LABELS.FOOD })}
            </StatusChip>
          )}
          {summary.foodStatus === "client" && <Chip variant="neutral">{t("badges.client")}</Chip>}
          {summary.otherProviderVerticals.map((vertical) => (
            <Chip key={vertical} variant="neutral">
              {t("badges.providerOf", { vertical: VERTICAL_LABELS[vertical] })}
            </Chip>
          ))}
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
