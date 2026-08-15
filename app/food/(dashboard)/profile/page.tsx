import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { DisplayNameField } from "@/components/seller/display-name-field";
import { AreasField } from "@/components/seller/areas-field";
import { BioField } from "@/components/seller/bio-field";
import { FulfillmentField } from "@/components/seller/fulfillment-field";
import { GalleryManager } from "@/components/seller/gallery-manager";
import { LanguagesField } from "@/components/seller/languages-field";
import { PhotoField } from "@/components/seller/photo-field";
import { SellerStatusNote } from "@/components/seller/status-banner";
import { SpecialtiesField } from "@/components/seller/specialties-field";
import { loadSellerWorkspace } from "@/lib/seller";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.profile");
  return { title: t("title") };
}

/**
 * The always-available profile editor (F1's `/food/profile`).
 *
 * Every field group here is the SAME component the guided setup renders, with
 * `nextHref` omitted — which turns "Continue and advance" into "Save and stay".
 * One implementation, two presentations: the wizard is for the first ten
 * minutes, this is for every day after, and neither can validate differently
 * from the other because there is only one validator per field.
 */
async function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-6">
      <h2 className="font-display text-h2 font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default async function SellerProfilePage() {
  const t = await getTranslations("seller.profile");
  const ts = await getTranslations("seller.setup");
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/setup");
  const { seller } = workspace;

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>
        <p className="max-w-prose text-body text-ink">{t("intro")}</p>
        {/* The slug is shown, never edited — it is a buyer-facing URL a cook
            pastes into WhatsApp, and rotating it on a rename would break every
            link they have already shared (lib/slug.ts). */}
        <p className="text-caption text-ink">{t("publicUrl", { slug: seller.slug })}</p>
        <div>
          <Button variant="outline" asChild>
            <Link href="/food/profile/setup">{t("guidedSetup")}</Link>
          </Button>
        </div>
      </header>

      {/* Same reason as the guided-setup flow: standing must be visible where
          the work happens, not only on the dashboard root. */}
      <SellerStatusNote status={seller.status} />

      <Section title={ts("steps.photo.title")}>
        <PhotoField
          kind="avatar"
          currentKey={seller.profileImageCard}
          blurDataUrl={seller.profileImageBlur}
        />
      </Section>

      <Section title={ts("steps.cover.title")}>
        <PhotoField
          kind="cover"
          currentKey={seller.coverImageCard}
          blurDataUrl={seller.coverImageBlur}
        />
      </Section>

      <Section title={t("nameSection")}>
        <DisplayNameField initial={seller.displayName} />
      </Section>

      <Section title={ts("steps.bio.title")}>
        <BioField initial={seller.bio ?? ""} />
      </Section>

      <Section title={ts("steps.areas.title")}>
        <AreasField initial={seller.areas} />
      </Section>

      <Section title={ts("steps.languages.title")}>
        <LanguagesField initial={seller.languages} />
      </Section>

      <Section title={ts("steps.specialties.title")}>
        <SpecialtiesField initial={seller.specialties} />
      </Section>

      <Section title={ts("steps.fulfillment.title")}>
        <FulfillmentField initial={seller.fulfillmentModes} />
      </Section>

      <Section title={ts("steps.gallery.title")}>
        <GalleryManager photos={seller.photos} />
      </Section>
    </>
  );
}
