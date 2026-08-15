import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getProviderRegistrationConfig } from "@/lib/ecosystem";
import { sellerSurfaceUrl } from "@/lib/links";

/**
 * A slim buyer-surface footer.
 *
 * It exists for one specific reason: the seller entry point needs an honest
 * home on every width. Part F3's bottom tab bar has exactly five buyer
 * destinations and none of them is "sell here", and the header on a 390px phone
 * is already wordmark-plus-locale-pill. Without a footer the seller entry point
 * would exist only above 768px — on the wrong device for this market.
 *
 * ── Slice 13: the stub became a link ──
 * Through Slice 12 this was `<ComingSoon feature="becomeSeller">`, because
 * FOOD's `vertical_registration_config` row was seeded `false` and onboarding
 * did not exist. Both are now true, so the modal is gone and the registry entry
 * with it — the one-line contract, working in the direction it was designed for.
 *
 * ⚠ **Absolute URL, not a relative link.** The buyer surface is
 * `food.apoyolime.com` and the seller surface is `portal.apoyolime.com/food`;
 * `middleware.ts` 404s `/food/*` on the food host, so a relative href here would
 * send every would-be seller to a 404 on the one link the supply side depends
 * on. `lib/links.ts` owns that.
 *
 * ⚠ The §6b toggle gates VISIBILITY only (decision 15) and fails closed — a
 * transient ecosystem-API blip hides the CTA and shows the "not open yet" note
 * rather than breaking the storefront. It is not what authorizes registration;
 * `lib/actions/onboard-seller.ts` is.
 */
export async function SiteFooter() {
  const [t, tb, config] = await Promise.all([
    getTranslations("footer"),
    getTranslations("brand"),
    getProviderRegistrationConfig(),
  ]);

  return (
    <footer className="mt-auto border-t border-hairline bg-card">
      <div className="screen-pad flex flex-col items-start gap-4 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-display text-h2 font-semibold text-ink">{tb("name")}</p>
          <p className="max-w-md text-label text-ink-muted">{tb("tagline")}</p>
        </div>

        {config.FOOD ? (
          <Button variant="outline" asChild>
            {/* A plain <a>, not next/link: this crosses an origin in production,
                where client-side routing has nothing to prefetch or soft-navigate. */}
            <a href={sellerSurfaceUrl("/food/setup")}>{t("becomeSeller")}</a>
          </Button>
        ) : (
          <p className="text-label text-ink-muted">{t("sellingClosed")}</p>
        )}
      </div>
      <div className="screen-pad pb-6">
        <p className="text-caption text-ink-muted">{t("legal")}</p>
      </div>
    </footer>
  );
}
