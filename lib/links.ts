/**
 * Cross-surface links.
 *
 * Food is one build serving two ORIGINS (architecture Part B2):
 *   - `food.apoyolime.com`          — the buyer marketplace, the `(client)` group
 *   - `portal.apoyolime.com/food/…` — the seller dashboard, host-gated
 *
 * A relative `<Link href="/food/setup">` from a buyer page therefore
 * resolves to `food.apoyolime.com/food/setup`, which `middleware.ts`
 * correctly 404s. Any buyer-surface link INTO the seller surface has to be
 * absolute, which is what this module exists to make unavoidable.
 *
 * ⚠ Slice 7 deliberately deferred this: Food's seller entry point was a
 * `<ComingSoon>` stub until Slice 13, so an unused URL builder would have been
 * one more thing to keep true. It arrives now, with its first real caller.
 *
 * `NEXT_PUBLIC_SELLER_SURFACE_URL` is unset in local dev on purpose. Both
 * surfaces are reachable on `localhost:3012` there (middleware's unknown-host
 * case), so falling back to a relative path is not a degradation — it is the
 * only thing that works without DNS. In production it must be set, or a would-be
 * seller clicking the footer CTA lands on a 404 with nothing in any log.
 */

/** Absolute URL to a path on the seller surface, or a relative one in dev. */
export function sellerSurfaceUrl(path = "/food"): string {
  const base = process.env.NEXT_PUBLIC_SELLER_SURFACE_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

/** True when the seller surface lives on a different origin than the caller. */
export function sellerSurfaceIsCrossOrigin(): boolean {
  return !!process.env.NEXT_PUBLIC_SELLER_SURFACE_URL;
}

/**
 * Absolute URL onto **portal-web's own pages** — distinct from
 * `sellerSurfaceUrl` above, which points at Food's OWN seller dashboard that
 * merely happens to be hosted under the portal host's `/food/*` path. This one
 * targets pages portal-web itself renders (`/register`), a different app.
 *
 * ⚠ This is deliberately NOT a violation of the standing "a vertical must
 * never surface another vertical's URL as a redirect target" rule that
 * `components/seller/signed-out-notice.tsx` documents. That rule is about never
 * guessing at a SIBLING VERTICAL's door (Salon's, Apparel's, the Apoyo-Demia
 * app's). Portal is not a sibling — it is the ecosystem's own identity issuer
 * and the established provider-registration door, which every vertical is
 * expected to send would-be providers to. Verified against Salon's own already
 * shipped implementation of exactly this hop before writing it here:
 * `Apoyo-Salon/app/salon/register/page.tsx` redirects a signed-out visitor to
 * `providerSurfaceUrl("/register?source=salon")`, using its own near-identical
 * `lib/portal-url.ts` helper. This is that same pattern, Food's copy.
 *
 * `NEXT_PUBLIC_PORTAL_BASE_URL` is the same variable `lib/portal-auth.ts`
 * already requires for register/login to work at all (Slice 20), so this adds
 * no new prod configuration — it reuses what must already be set.
 */
export function portalPageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

/**
 * Food's provider APPLICATION, rendered by portal-web (workflow spec §3/§8).
 *
 * ⚠ WHY THIS EXISTS AS ITS OWN FUNCTION, given `portalPageUrl` above already
 * takes a path. Because `portalPageUrl` takes a path, every caller was
 * hand-writing the vertical-specific tail — and when program 3 renamed
 * `/register/food` to `/food/apply`, "one helper, one edit" turned out to be
 * true only for Apparel, which had a no-argument helper owning the whole URL.
 * A host helper is not a URL helper. This is the URL helper.
 *
 * ⚠ THE PATH LOOKS LIKE FOOD'S OWN SELLER SURFACE AND IS NOT. `/food/*` on the
 * portal host is this app (`sellerSurfaceUrl` above) — except `/food/apply`,
 * which US-S1 carved out to portal-web (:3011) via a dedicated `location ^~`
 * block. So this deliberately goes through `portalPageUrl`, NOT
 * `sellerSurfaceUrl`, even though the two resolve to the same host today: they
 * mean different things, and a future split would break the wrong one silently.
 * If this URL ever serves food-web's own 404, the nginx drop-in
 * `nginx.ssl.conf_apply` is missing — the bug is not in this repo.
 */
export function providerApplicationUrl(): string {
  return portalPageUrl("/food/apply");
}
