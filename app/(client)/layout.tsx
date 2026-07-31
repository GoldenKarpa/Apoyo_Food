import { BottomNav } from "@/components/chrome/bottom-nav";
import { SiteFooter } from "@/components/chrome/site-footer";
import { SiteHeader } from "@/components/chrome/site-header";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

/**
 * Client marketplace shell — food.apoyolime.com.
 *
 * Slice 7 replaced Slice 1's inline header with the real Sobremesa chrome:
 * `<SiteHeader>` (wordmark + locale pill + the ≥768px nav row) and
 * `<BottomNav>` (the phone tab bar, hidden from 768px). Both read the same
 * `components/chrome/nav-config.ts`, so the two widths can never offer
 * different navigation.
 *
 * `pb-24 md:pb-0` on the main column keeps the last row of content clear of the
 * sticky tab bar on a phone — without it a card's bottom edge sits underneath
 * the bar and looks clipped at exactly the scroll position where a viewer stops.
 *
 * `<ServiceWorkerRegister>` (Slice 12) lives here, not in the root layout —
 * the seller dashboard was never meant to be the installed PWA's entry point
 * (`app/manifest.ts`'s own `start_url` is this surface's root).
 */
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <ServiceWorkerRegister />
      <SiteHeader />
      <main className="screen-pad flex flex-1 flex-col gap-8 py-8 pb-24 md:pb-8">{children}</main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
