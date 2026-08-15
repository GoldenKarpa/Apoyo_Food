import { getTranslations } from "next-intl/server";

import { getProviderRegistrationConfig } from "@/lib/ecosystem";
import { providerApplicationUrl } from "@/lib/links";

/**
 * The provider door, offered from the CLIENT registration page.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Someone who wants to cook for Apoyo, lands on `/register` and starts filling
 * in the buyer form has no in-context signal that they are on the wrong one.
 * Requested 2026-08-10; built as one cross-vertical pass so Food, Apparel and
 * Salon answer it identically.
 *
 * ⚠ **This is a discoverability fix, not a missing path.** `<SiteFooter>`
 * already renders a gated provider CTA on every `(client)` page including this
 * one, so the door was reachable — just below the fold and dressed as site
 * chrome rather than as an answer to "I think I'm in the wrong place". Verified
 * live on all three storefronts before writing this; the 2026-08-10 note
 * claiming Apparel and Salon had no path at all was already stale, their
 * footers having arrived in the vertical-uniformity pass. So keep this quiet:
 * an inline line under the card, deliberately NOT a second button competing
 * with the registration the visitor actually came for.
 *
 * ⚠ Gated on the FOOD toggle (§6b), and **renders nothing when closed** — no
 * "opens soon" note, unlike the footer's. The footer speaks to someone who came
 * looking to sell; this speaks to someone who did not, and telling a buyer that
 * a door they never asked about is shut is pure noise. `<SiteFooter>` on this
 * same page still carries that message for the audience it is for.
 *
 * ⚠ The gate is CTA visibility only, never authorization — same rule the footer
 * and landing CTAs document. `getProviderRegistrationConfig` fails closed on an
 * ecosystem-API blip, so the worst case is a hidden hint, never a broken
 * registration page. It is `cache()`d per request, so the footer's own call on
 * this same render costs nothing extra.
 *
 * A plain `<a>`, not `next/link`: the application is portal-web's page on
 * another origin in production, where client-side routing has nothing to
 * prefetch or soft-navigate.
 */
export async function ProviderDoorHint() {
  const [t, config] = await Promise.all([
    getTranslations("client.register"),
    getProviderRegistrationConfig(),
  ]);

  if (!config.FOOD) return null;

  return (
    <p className="w-full max-w-sm border-t border-hairline pt-4 text-center text-label text-ink-muted">
      {t("providerDoorPrompt")}{" "}
      <a
        href={providerApplicationUrl()}
        className="font-medium text-green underline-offset-4 hover:underline"
      >
        {t("providerDoorCta")}
      </a>
    </p>
  );
}
