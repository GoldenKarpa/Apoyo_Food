import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { DemoShell } from "@/components/demo/demo-shell";
import { resolveDemoAccess } from "@/lib/demo/access";
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
 * ⚠ **Denial is `notFound()`, not a 403, and there is NO exception.** A 403
 * tells someone the route exists when the answer is meant to be that it does
 * not — and so, it turns out, does a login redirect. Until 2026-08-20 a
 * signed-out visitor was offered a sign-in "because the login door is public
 * anyway", which missed that the *choice between two responses* is itself the
 * disclosure: 404 when the toggle was OFF, a redirect when it was ON, so anyone
 * with no account could read the toggle by probing. That is R6. Every denial is
 * now the same 404 — see `lib/demo/access.ts` for the full rationale, including
 * why moving the session check first would have been the wrong fix and what
 * this trade costs.
 */
export default async function FoodDemoPage() {
  const access = await resolveDemoAccess();

  // ⚠ ONE response for every denial — off, signed out, unverified, or without
  // provider standing. R6 (Provider_Demo_Plan.md §2.2, amended 2026-08-20):
  // anything that differs by mode lets a signed-out visitor read the toggle.
  if (!access.allowed) notFound();

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
