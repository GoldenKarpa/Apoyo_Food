/**
 * Cross-surface links.
 *
 * Food is one build serving two ORIGINS (architecture Part B2):
 *   - `food.apoyolime.com`          — the buyer marketplace, the `(client)` group
 *   - `portal.apoyolime.com/food/…` — the seller dashboard, host-gated
 *
 * A relative `<Link href="/food/onboarding">` from a buyer page therefore
 * resolves to `food.apoyolime.com/food/onboarding`, which `middleware.ts`
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
