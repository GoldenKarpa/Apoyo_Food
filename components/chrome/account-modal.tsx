"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";

import { signOutPortal } from "@/lib/portal-auth";

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

/**
 * Sign-out, with the ecosystem-wide warning stated BEFORE the click that fires
 * it, not after (Slice 23). Two-step by design: the first press swaps this
 * control for an explicit "this signs you out of every Apoyo site" confirmation,
 * because the blast radius genuinely exceeds what a button labelled "Sign out"
 * inside Food's own chrome would imply — see `signOutPortal`'s own comment for
 * why an ecosystem-wide sign-out is the ONLY kind available here.
 *
 * On success the page is refreshed rather than redirected: `getAccountSummary()`
 * runs in the shared layout on the server, so a refresh is what actually
 * re-renders the nav into its signed-out state. Staying put also keeps a
 * browsing visitor where they were — nothing on the public marketplace requires
 * a session, so there is nothing to flee from.
 */
function SignOutControl() {
  const t = useTranslations("account.signOut");
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  async function handleSignOut() {
    setPending(true);
    setFailed(false);
    const result = await signOutPortal();
    if (result.ok) {
      router.refresh();
      return;
    }
    // Left on-screen deliberately: a failed sign-out that silently did nothing
    // would leave someone believing they had signed out on a shared device.
    setPending(false);
    setFailed(true);
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="lg" onClick={() => setConfirming(true)} data-signout-start="">
        {t("action")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-hairline p-4">
      <p className="text-label text-ink">{t("confirmBody")}</p>
      {failed && <p className="text-label text-error">{t("failed")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={handleSignOut} disabled={pending} data-signout-confirm="">
          {pending ? t("pending") : t("confirmAction")}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

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
 * What the Account nav item opens for a SIGNED-OUT visitor (Slice 23).
 *
 * Replaces the plain `<ComingSoon feature="buyerAccount">` stub that used to
 * render here. That stub was correct about the unbuilt Phase-4 account page,
 * but it was also the ONLY thing the Account button did when signed out — so a
 * visitor who wanted to sign in or create an account was told "coming soon"
 * and given nowhere to go, on the one control in the whole app named after the
 * thing they were looking for. Found live during real onboarding testing:
 * nothing anywhere in the app linked to `/login` or `/register` from a
 * signed-out state.
 *
 * Keeps the stub's own phase note (this is still not the real account page)
 * while adding the two doors that DO exist — the same "carry the context
 * forward rather than drop it" call `<AccountModal>`'s own more-is-coming note
 * documents.
 */
export function SignedOutAccountModal({ children }: { children: React.ReactNode }) {
  const t = useTranslations("account.signedOut");
  const tc = useTranslations("comingSoon");

  return (
    <BottomSheet>
      <BottomSheetTrigger asChild>{children}</BottomSheetTrigger>
      <BottomSheetContent title={t("title")} description={t("body")}>
        <div className="flex flex-col gap-3">
          <BottomSheetClose asChild>
            <Button variant="primary" size="lg" asChild>
              <Link href="/login">{t("signIn")}</Link>
            </Button>
          </BottomSheetClose>
          <BottomSheetClose asChild>
            <Button variant="outline" size="lg" asChild>
              <Link href="/register">{t("register")}</Link>
            </Button>
          </BottomSheetClose>
        </div>

        {/* The retired stub's own Phase-4 note, kept rather than dropped. */}
        <div className="flex items-center gap-2 rounded-card bg-sunken p-4">
          <ComingSoonBadge />
          <p className="text-label text-ink">{tc("phaseNote", { phase: 4 })}</p>
        </div>
      </BottomSheetContent>
    </BottomSheet>
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

        <SignOutControl />

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
