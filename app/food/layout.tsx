import { getTranslations } from "next-intl/server";

import { LocaleToggle } from "@/components/locale-toggle";

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
 */
export default async function FoodSurfaceLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("brand");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-hairline bg-card">
        <div className="screen-pad flex min-h-[64px] items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-h1 font-semibold text-green">{t("name")}</span>
            <span className="rounded-pill bg-green-soft px-3 py-1 text-caption font-medium text-ink">
              /food
            </span>
          </div>
          {/* Sellers are Spanish-first, but the toggle is still always visible
              here — the seller surface merely DEFAULTS to es (i18n/request.ts). */}
          <LocaleToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
