import { getTranslations } from "next-intl/server";
import { LayoutGrid } from "lucide-react";

import { LocaleToggle } from "@/components/locale-toggle";
import { AccountAvatarIcon, AccountModal } from "@/components/chrome/account-modal";
import { getAccountSummary } from "@/lib/get-account-summary";
import { portalPageUrl } from "@/lib/links";
import { SellerNav } from "@/components/seller/seller-nav";
import { loadSellerWorkspace } from "@/lib/seller";

/**
 * The seller workspace shell: the header, the nav bar, and the padded `<main>`
 * every dashboard route renders into.
 *
 * ⚠ Lives in the `(dashboard)` route group, NOT in `app/food/layout.tsx`,
 * specifically so it does NOT wrap `/food/admin` — that surface renders the
 * full-viewport Apoyo admin shell, which must be visually identical to Portal's,
 * and this header stacked on top of it was a real visible bug (fixed 2026-08-15;
 * see the parent layout's own note). Apparel made exactly this move at its
 * Slice 16.
 *
 * ⚠ This layout deliberately owns the outer flex container as well as the
 * header. `<main>`'s `flex-1` needs a flex parent with a height to fill, and
 * that used to come from the parent layout — so the container had to move with
 * the header rather than being left behind.
 *
 * ⚠ Nothing here authorizes anything. `<SellerNav>` renders only for someone who
 * already owns a `FoodSeller` row, but that is presentation — every write
 * re-resolves the seller from the session (`lib/seller.ts`), and per Slice 16's
 * warning a layout gate controls what is *displayed*, not what *executes*. The
 * nav appears only once that row exists, because before it the whole surface is
 * a single "become a seller" page and a workspace nav above it would advertise
 * five destinations that all say "finish registering first".
 *
 * The account avatar (Slice 21) reuses the exact same `<AccountModal>` /
 * `getAccountSummary()` the client surface uses — both are already generic over
 * which surface renders them. A signed-out visitor simply sees no avatar.
 */
export default async function SellerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [t, tSeller, accountSummary, workspace] = await Promise.all([
    getTranslations("brand"),
    getTranslations("seller"),
    getAccountSummary(),
    loadSellerWorkspace(),
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
      {workspace.seller && <SellerNav />}
      <main className="screen-pad flex flex-1 flex-col gap-6 py-8">{children}</main>
    </div>
  );
}
