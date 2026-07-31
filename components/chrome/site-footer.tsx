import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

/**
 * A slim buyer-surface footer.
 *
 * It exists for one specific reason: `becomeSeller` needs an honest home on
 * every width. Part F3's bottom tab bar has exactly five buyer destinations and
 * none of them is "sell here", and the header on a 390px phone is already
 * wordmark-plus-locale-pill. Without a footer the seller entry point would exist
 * only above 768px — on the wrong device for this market.
 *
 * It is a **stub, not a link**, on purpose. FOOD's `vertical_registration_config`
 * row is seeded `false` (Slice 3) because onboarding does not exist until Slice
 * 13, so linking to Portal's provider registration would land a would-be seller
 * on a disabled form. The modal explains the plan instead. Slice 13 replaces
 * this with a real link and deletes the registry entry.
 */
export async function SiteFooter() {
  const [t, tb] = await Promise.all([getTranslations("footer"), getTranslations("brand")]);

  return (
    <footer className="mt-auto border-t border-hairline bg-card">
      <div className="screen-pad flex flex-col items-start gap-4 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-display text-h2 font-semibold text-ink">{tb("name")}</p>
          <p className="max-w-md text-label text-ink-muted">{tb("tagline")}</p>
        </div>
        <ComingSoon feature="becomeSeller" variant="outline" />
      </div>
      <div className="screen-pad pb-6">
        <p className="text-caption text-ink-muted">{t("legal")}</p>
      </div>
    </footer>
  );
}
