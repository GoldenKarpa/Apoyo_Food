import { getTranslations } from "next-intl/server";
import { LayoutGrid } from "lucide-react";

import { LocaleToggle } from "@/components/locale-toggle";
import { AccountAvatarIcon, AccountModal } from "@/components/chrome/account-modal";
import { getAccountSummary } from "@/lib/get-account-summary";
import { portalPageUrl } from "@/lib/links";

/**
 * Seller dashboard + admin shell — served at portal.apoyolime.com/food/… and
 * physically nested under /food from the first commit (architecture Part B2).
 * middleware.ts 404s this whole subtree on the food.* host.
 *
 * ⚠ This layout deliberately carries NO padding of its own. Slice 13's
 * dashboard nav is a full-bleed bar under the header, which cannot be produced
 * from inside a padded `<main>`; each route group supplies its own `<main>`
 * instead. `app/food/(dashboard)/layout.tsx` does it for the workspace,
 * `/food/admin` and `/food/login` do it for themselves.
 *
 * ⚠ Nothing here authorizes anything. `<SellerNav>` renders only for someone
 * who already owns a `FoodSeller` row, but that is presentation — every write
 * re-resolves the seller from the session (`lib/seller.ts`), and per Slice 16's
 * warning a layout gate controls what is *displayed*, not what *executes*.
 *
 * The account avatar (Slice 21, extended here) reuses the exact same
 * `<AccountModal>`/`getAccountSummary()` the client surface uses — both are
 * already generic over which surface renders them. Unlike the client
 * surface, there is no pre-existing "Account" stub to preserve here, so a
 * signed-out visitor simply sees no avatar at all (this header already had
 * nothing account-related before this change).
 */
export default async function FoodSurfaceLayout({ children }: { children: React.ReactNode }) {
  const [t, tSeller, accountSummary] = await Promise.all([
    getTranslations("brand"),
    getTranslations("seller"),
    getAccountSummary(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-hairline bg-card">
        <div className="screen-pad flex min-h-[64px] items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-h1 font-semibold text-green">{t("name")}</span>
            {/* Names what this surface IS, rather than echoing the URL path it
                happens to live under. The literal "/food" read as a glitch —
                as though the wordmark had lost a word — to the first person
                who saw it outside this codebase. */}
            <span className="rounded-pill bg-green-soft px-3 py-1 text-caption font-medium text-ink">
              {tSeller("workspaceBadge")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Found live 2026-08-09: nothing on this surface led back to
                portal's own launchpad (the vertical-card picker at /home) —
                once in, a seller had no way back short of hand-editing the
                URL. `portalPageUrl` targets portal-web's OWN pages, not a
                sibling vertical's, so this is not the "never guess at
                another vertical's door" rule (see that helper's own comment) —
                Portal is the ecosystem hub every vertical is expected to
                link back to. */}
            <a
              href={portalPageUrl("/home")}
              className="tap-target flex items-center gap-1 rounded-pill px-2 py-1 text-caption font-medium text-ink hover:bg-sunken"
            >
              <LayoutGrid aria-hidden className="size-4" />
              {tSeller("portalHome")}
            </a>
            {/* Sellers are Spanish-first, but the toggle is still always
                visible here — the seller surface merely DEFAULTS to es
                (i18n/request.ts). */}
            <LocaleToggle />
            {accountSummary && (
              <AccountModal summary={accountSummary}>
                <button type="button" className="tap-target flex items-center justify-center rounded-pill hover:bg-sunken" data-account-avatar="">
                  <AccountAvatarIcon summary={accountSummary} className="h-5 w-5" />
                </button>
              </AccountModal>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
