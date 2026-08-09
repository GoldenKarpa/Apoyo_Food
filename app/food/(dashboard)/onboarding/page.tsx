import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { OnboardForm } from "@/components/seller/onboard-form";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { loadSellerWorkspace } from "@/lib/seller";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.onboarding");
  return { title: t("title") };
}

/**
 * Seller registration.
 *
 * ⚠ An existing seller is REDIRECTED to their workspace rather than shown this
 * form again. `onboardSeller` is idempotent, so re-submitting would be harmless
 * — but a registration form presented to someone who has already registered is
 * a genuine "did that not work?" moment, and this flow's whole design goal is
 * that a first-time seller never wonders whether something saved.
 *
 * ⚠ The §6b registration toggle is NOT consulted here. It gates CTA visibility
 * (decision 15) and is not a security control; treating a direct visit to this
 * URL as unauthorized would quietly promote it back into one. The real gate is
 * what registration produces: a PENDING seller, invisible to every buyer
 * surface until Slice 16's queue approves them.
 */
export default async function SellerOnboardingPage() {
  const t = await getTranslations("seller.onboarding");
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice loginHref="/login" />;
  if (workspace.seller) redirect("/food");

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>
        <p className="max-w-prose text-body text-ink">{t("intro")}</p>
      </header>

      <OnboardForm />

      <section className="max-w-prose rounded-card border border-hairline bg-sunken p-6">
        <h2 className="font-display text-h3 font-semibold text-ink">{t("privacyTitle")}</h2>
        {/* Part G, said out loud on the surface where it is earned rather than
            only in a code comment: a home cook is agreeing to strangers coming
            to their house, and they deserve to know what the product does and
            does not publish before they agree to it. */}
        <p className="mt-2 text-label text-ink">{t("privacyBody")}</p>
      </section>

      <div>
        <Button variant="ghost" asChild>
          <Link href="/food">{t("back")}</Link>
        </Button>
      </div>
    </>
  );
}
