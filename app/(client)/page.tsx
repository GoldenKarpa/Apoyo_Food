import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * Slice 9 builds the real home — the Fresh Today rail and Part E1's composed
 * discovery sections, against Slice 8's seed. Until then this is the hero and
 * nothing else.
 *
 * Slice 7 removed the three Slice 1–5 proof components that used to sit here
 * (`token-proof`, `media-proof`, `translation-proof`). What they proved now
 * lives on `/style-guide`, rendered through the real components instead of
 * bespoke scaffolding — which is a better proof of the same criteria.
 */
export default async function HomePage() {
  const [t, tc] = await Promise.all([getTranslations("client.home"), getTranslations("common")]);

  return (
    <section className="flex flex-col gap-4">
      {/* The handwritten accent, used exactly as Part F3 permits: an occasional
          section label, never body/buttons/prices/data. */}
      <SectionHeader title={tc("freshToday")} script as="h2" />
      <h1 className="text-display font-semibold">{t("title")}</h1>
      <p className="max-w-2xl text-body text-ink-muted">{t("intro")}</p>
      <div>
        <Button asChild size="lg">
          <Link href="/browse">{t("browse")}</Link>
        </Button>
      </div>
      <p className="text-label text-ink-muted">{t("freshTodayNote")}</p>
    </section>
  );
}
