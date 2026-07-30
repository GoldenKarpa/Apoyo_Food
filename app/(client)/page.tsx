import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { MediaProof } from "@/components/scaffold/media-proof";
import { SurfaceBanner } from "@/components/scaffold/surface-banner";
import { TokenProof } from "@/components/scaffold/token-proof";
import { TranslationProof } from "@/components/scaffold/translation-proof";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const [t, tc] = await Promise.all([getTranslations("client.home"), getTranslations("common")]);

  return (
    <>
      <SurfaceBanner />

      <section className="flex flex-col gap-4">
        {/* The handwritten accent, used exactly as Part F3 permits: an
            occasional section label, never body/buttons/prices/data. */}
        <p className="font-hand text-h1 text-teal">{tc("freshToday")}</p>
        <h1 className="text-display font-semibold">{t("title")}</h1>
        <p className="max-w-2xl text-body text-ink-muted">{t("intro")}</p>
        <div>
          <Button asChild size="lg">
            <Link href="/browse">{t("browse")}</Link>
          </Button>
        </div>
        <p className="text-label text-ink-muted">{t("freshTodayNote")}</p>
      </section>

      <TranslationProof />
      <MediaProof />
      <TokenProof />
    </>
  );
}
