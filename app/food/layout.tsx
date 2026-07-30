import { getTranslations } from "next-intl/server";

import { LocaleToggle } from "@/components/locale-toggle";
import { SurfaceBanner } from "@/components/scaffold/surface-banner";

/**
 * Seller dashboard + admin shell — served at portal.apoyolime.com/food/… and
 * physically nested under /food from the first commit (architecture Part B2).
 * middleware.ts 404s this whole subtree on the food.* host.
 *
 * Deliberately minimal: Slice 13 builds the real dashboard nav and empty
 * states, Slice 16 composes /food/admin into the shared Apoyo admin shell (with
 * its own namespaced CSS, kept away from this app's Tailwind tokens).
 *
 * ⚠ Nothing here authorizes anything yet. The seller/admin guards arrive in
 * Slice 3 (`requireFoodSeller`, `requireAdmin`), and per Slice 16's warning a
 * layout gate controls what is *displayed*, not what *executes* — every
 * data-loading admin page must call the payload guard before its first query.
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
      <main className="screen-pad flex flex-1 flex-col gap-6 py-8">
        <SurfaceBanner />
        {children}
      </main>
    </div>
  );
}
