import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { SetupProgress } from "@/components/seller/setup-progress";
import { StepNav } from "@/components/seller/step-nav";
import { AreasField } from "@/components/seller/areas-field";
import { BioField } from "@/components/seller/bio-field";
import { FulfillmentField } from "@/components/seller/fulfillment-field";
import { GalleryManager } from "@/components/seller/gallery-manager";
import { LanguagesField } from "@/components/seller/languages-field";
import { PhotoField } from "@/components/seller/photo-field";
import { SpecialtiesField } from "@/components/seller/specialties-field";
import { SellerStatusNote } from "@/components/seller/status-banner";
import { loadSellerWorkspace } from "@/lib/seller";
import { isSetupStepKey, SETUP_STEPS, type SetupStepKey } from "@/lib/seller-profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.setup");
  return { title: t("title") };
}

/**
 * The guided profile setup — architecture F2's "photo -> cover -> bio -> areas
 * on the Trinidad map -> languages -> specialties -> fulfillment modes", plus
 * the gallery.
 *
 * ── Skippable and resumable, structurally ──
 * There is no wizard state anywhere. Each step writes its own field group to
 * the `FoodSeller` row on Continue, and where the flow RESUMES is derived by
 * reading that row back (`nextIncompleteStep`). So:
 *   - closing the tab mid-flow loses nothing that was submitted;
 *   - coming back tomorrow, on another device, lands on the same step;
 *   - "Skip" is a plain link that advances without saving, so declining a step
 *     cannot persist a half-typed value;
 *   - and every step is reachable directly from the progress list, because a
 *     flow that can only be walked forwards is not resumable in any useful
 *     sense.
 *
 * ⚠ The same field components back `/food/profile`, the always-available
 * editor. The wizard is chrome around them, not a second implementation — which
 * is what stops "the setup flow validated it differently" from ever being true.
 */
export default async function SellerSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const t = await getTranslations("seller.setup");
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  // No row yet — there is nothing to set up. Registration comes first, and
  // sending someone to a form that would write to a nonexistent seller is
  // worse than one redirect.
  if (!workspace.seller) redirect("/food/setup");

  const { seller, steps, percent, nextStep } = workspace;
  const requested = (await searchParams).step;

  // ⚠ A bare `/food/profile/setup` RESOLVES the resume target and then
  // REDIRECTS to it, rather than rendering it in place. Rendering in place is
  // the obvious implementation and it is wrong: the step would be derived from
  // the data on every render, so the moment a step completes — a photo upload
  // calling `router.refresh()`, say — the page would silently swap to the NEXT
  // step underneath someone who is still looking at the one they just
  // finished. Caught in this slice's own browser pass, where "Continue" never
  // appeared after an upload because the page had already moved on.
  //
  // Pinning the URL also makes the step shareable, bookmarkable and stable
  // across a reload, which is most of what "resumable" means in practice.
  if (!isSetupStepKey(requested)) {
    redirect(`/food/profile/setup?step=${nextStep ?? "photo"}`);
  }
  const current: SetupStepKey = requested;

  const index = SETUP_STEPS.indexOf(current);
  const next = SETUP_STEPS[index + 1];
  const nextHref = next ? `/food/profile/setup?step=${next}` : "/food";

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>
        <p className="max-w-prose text-body text-ink">{t("intro")}</p>
      </header>

      {/* Standing, stated where a new seller actually is — this flow is where
          they spend their first session, and it used to say nothing about
          being unreviewed. See <SellerStatusNote>'s own comment. */}
      <SellerStatusNote status={seller.status} />

      <SetupProgress steps={steps} current={current} percent={percent} />

      <section className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-h2 font-semibold text-ink">
            {t(`steps.${current}.title`)}
          </h2>
          <p className="max-w-prose text-label text-ink">{t(`steps.${current}.body`)}</p>
        </div>

        {current === "photo" && (
          <>
            <PhotoField
              kind="avatar"
              currentKey={seller.profileImageCard}
              blurDataUrl={seller.profileImageBlur}
            />
            <StepNav nextHref={nextHref} done={seller.profileImageThumb !== null} />
          </>
        )}

        {current === "cover" && (
          <>
            <PhotoField
              kind="cover"
              currentKey={seller.coverImageCard}
              blurDataUrl={seller.coverImageBlur}
            />
            <StepNav nextHref={nextHref} done={seller.coverImageThumb !== null} />
          </>
        )}

        {current === "bio" && <BioField initial={seller.bio ?? ""} nextHref={nextHref} />}
        {current === "areas" && <AreasField initial={seller.areas} nextHref={nextHref} />}
        {current === "languages" && (
          <LanguagesField initial={seller.languages} nextHref={nextHref} />
        )}
        {current === "specialties" && (
          <SpecialtiesField initial={seller.specialties} nextHref={nextHref} />
        )}
        {current === "fulfillment" && (
          <FulfillmentField initial={seller.fulfillmentModes} nextHref={nextHref} />
        )}

        {current === "gallery" && (
          <>
            <GalleryManager photos={seller.photos} />
            <StepNav nextHref={nextHref} done={seller.photos.length > 0} />
          </>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" asChild>
          <Link href="/food">{t("toDashboard")}</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/food/profile">{t("toEditor")}</Link>
        </Button>
      </div>
    </>
  );
}
