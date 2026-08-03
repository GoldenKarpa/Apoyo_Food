import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { SellerStatusBanner } from "@/components/seller/status-banner";
import { ProfileChecklist } from "@/components/seller/profile-checklist";
import { WorkspaceEmptyStates } from "@/components/seller/workspace-empty-states";
import { loadSellerWorkspace } from "@/lib/seller";
import { ensureFoodProviderMembership } from "@/lib/auth-guards";
import { getProviderRegistrationConfig } from "@/lib/ecosystem";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.dashboard");
  return { title: t("title") };
}

/**
 * The seller workspace home — one route, five states.
 *
 * ⚠ This page is the reason Slice 3 split `resolveFoodSeller` from
 * `requireFoodSeller`. A PENDING or SUSPENDED seller must see their own
 * workspace with their own standing explained, not an unauthorized error: they
 * have registered, they are waiting on something, and telling them "no" is how
 * a marketplace loses the supply side before it has any.
 *
 * ⚠ The `(FOOD, PROVIDER)` membership is RE-ASSERTED on every render for a
 * seller who has a row. That is the repair path for the deliberate write order
 * in `lib/actions/onboard-seller.ts` (row first, standing second): if the mint
 * failed at registration — ecosystem API down, token missing, network blip —
 * the seller still got a working dashboard, and the next time they open it the
 * standing quietly lands. Best-effort by construction: the helper swallows its
 * own failure and returns false, so a dead ecosystem API can never take this
 * page down.
 */
export default async function SellerDashboardPage() {
  const t = await getTranslations("seller");
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;

  if (workspace.state === "no-seller") {
    // CTA VISIBILITY only (decision 15) — this is not authorization, and
    // `onboardSeller` deliberately does not consult it. It fails closed, which
    // is the right way round for a switch whose job is to hide a door.
    const config = await getProviderRegistrationConfig();

    return (
      <section className="rounded-card border border-hairline bg-card p-6">
        <h1 className="font-display text-h1 font-semibold text-ink">{t("become.title")}</h1>
        <p className="mt-3 max-w-prose text-body text-ink">{t("become.body")}</p>

        {config.FOOD ? (
          <div className="mt-6">
            <Button size="lg" asChild>
              <Link href="/food/onboarding">{t("become.cta")}</Link>
            </Button>
          </div>
        ) : (
          <p className="mt-6 rounded-card bg-sunken p-4 text-label text-ink">{t("become.closed")}</p>
        )}
      </section>
    );
  }

  const { seller, steps, percent, nextStep } = workspace;
  if (!seller) return <SignedOutNotice />; // unreachable; narrows the type

  await ensureFoodProviderMembership(seller.userId);

  return (
    <>
      <SellerStatusBanner status={seller.status} displayName={seller.displayName} />

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={nextStep ? `/food/profile/setup?step=${nextStep}` : "/food/profile"}>
            {nextStep ? t("dashboard.continueSetup") : t("dashboard.editProfile")}
          </Link>
        </Button>
        {seller.status === "ACTIVE" && (
          <Button variant="outline" asChild>
            {/* Only when ACTIVE: `/sellers/[slug]` enforces the Slice 9
                visibility rule and 404s a PENDING or SUSPENDED seller, so
                offering the link earlier would send a new seller to a dead end
                on their own profile. */}
            <Link href={`/sellers/${seller.slug}`}>{t("dashboard.viewPublic")}</Link>
          </Button>
        )}
      </div>

      <ProfileChecklist steps={steps} percent={percent} />
      <WorkspaceEmptyStates />
    </>
  );
}
