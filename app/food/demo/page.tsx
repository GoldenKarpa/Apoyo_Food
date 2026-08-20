import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { DemoShell } from "@/components/demo/demo-shell";
import { resolveDemoAccess } from "@/lib/demo/access";
import { portalPageUrl } from "@/lib/links";
import type { Locale } from "@/i18n/request";

export const metadata: Metadata = { title: "Apoyo Food — demo" };
// The access mode can change under an admin's hand at any time; a cached page
// would keep serving the demo after it was switched off.
export const dynamic = "force-dynamic";

/**
 * PD-S10 — the Food seller demo.
 *
 * Plan: `Apoyo-Portal/Provider_Demo_Plan.md`.
 *
 * ⚠ **Deliberately NOT inside `app/food/(dashboard)/`.** That group's layout is
 * the seller chrome, and every page under it calls `loadSellerWorkspace()` and
 * `redirect("/food/setup")` for a session with no `FoodSeller` row — precisely
 * what a demo visitor does not have, and the whole reason they are here. (The
 * layout itself does not hard-redirect, it only conditionally renders
 * `<SellerNav>`; the pages are what make the group the wrong host.) Following
 * Salon's and Apparel's precedent, the demo is a sibling route with its own
 * guard and its own chrome. `app/food/layout.tsx` is a bare passthrough, so
 * nothing wraps this but what the shell renders itself.
 *
 * ⚠ **Denial is `notFound()`, not a 403.** A 403 tells someone the route exists
 * when the answer is meant to be that it does not — see `lib/demo/access.ts`.
 *
 * ⚠ **The one exception is a signed-out visitor**, who is offered a sign-in.
 * That reveals nothing, since the sign-in door is public anyway. Note it is
 * PORTAL's sign-in via `portalPageUrl()`, not Food's own `/login` — the demo is
 * only ever reachable on `portal.apoyolime.com`, where a relative `/login` is
 * portal-web's page rather than this app's, and where `middleware.ts` 404s
 * every non-`/food` path of ours anyway. `lib/links.ts` documents at length why
 * linking to portal is not the "never guess at another vertical's door"
 * violation it superficially resembles: portal is the ecosystem's identity
 * issuer, not a sibling vertical.
 *
 * ⚠ **Host note.** `/food/*` is served only on `portal.apoyolime.com`;
 * middleware 404s it on `food.apoyolime.com`. Correct for the demo — it is a
 * seller-side surface and its entry point is the portal launchpad.
 *
 * ⚠ **No database, and no query above or below this line.** The whole demo is
 * fixtures (D4/D5). If a future change makes this page read Prisma, the demo
 * has stopped being what it is — and `scripts/verify-demo-browser.mjs` runs
 * with Postgres DOWN precisely so that stops being an opinion.
 */
export default async function FoodDemoPage() {
  const access = await resolveDemoAccess();

  if (!access.allowed) {
    if (access.signedOut) {
      redirect(portalPageUrl(`/login?callbackUrl=${encodeURIComponent("/food/demo")}`));
    }
    notFound();
  }

  // Resolved here rather than inside the shell: the shell is a client component
  // and next-intl's async locale read is server-only. It drives both the demo's
  // own chrome and every fixture's copy (plan R3 — bilingual from the first
  // commit, not a follow-up pass). Food's seller surface defaults to `es`.
  const locale = (await getLocale()) as Locale;

  // ⚠ ONE epoch, resolved here and threaded all the way down to the fixtures.
  //
  // The fixtures are relative to "now" (a request whose respondBy has not
  // passed, a booking three days out), and they are built inside `useState`
  // initializers — which React runs ONCE on the server render and AGAIN on
  // hydration. Calling `Date.now()` in there produces two different fixture
  // sets for the same page and an intermittent hydration mismatch on anything
  // near a minute boundary. Resolving it once on the server makes both passes
  // identical by construction rather than by luck. (Apparel's PD-S9 review
  // found this first, in the same shape.)
  const nowMs = Date.now();

  return <DemoShell locale={locale} nowMs={nowMs} />;
}
