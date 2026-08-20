/**
 * Turns a storage key into a URL, or names an upload endpoint, that the
 * *current surface* can actually reach.
 *
 * ⚠ The two surfaces need different paths, and getting it wrong fails only in
 * production (ecosystem ruling E14). Food's OWN domain (`food.apoyolime.com`)
 * proxies every path to this app (`DEPLOYMENT.md` §6a), so every bare
 * `/api/*` route already works there. The seller dashboard is path-nested on
 * `portal.apoyolime.com/food`, where nginx forwards ONLY `/food/*` and
 * `/api/food/*` (§6b) — a bare `/api/media/...` request made from a page
 * rendered there falls through to the portal host's catch-all (a different
 * app entirely) and 500s/404s with nothing whatsoever in THIS app's own error
 * log. Locally both work, because one origin serves both surfaces, so this
 * cannot be caught in dev.
 *
 * Never build either path by hand; call one of these. `lib/media/image-loader.ts`
 * (the `next/image` loader) reads the same seller prefix so responsive variant
 * selection (thumb/card/full) keeps working no matter which surface asked.
 */

/** Buyer-reachable read prefix — Food's own domain, `location /` covers it. */
export const BUYER_MEDIA_PREFIX = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || "/api/media";

/** Seller-reachable read prefix — the one media namespace nginx proxies on the portal host. */
export const SELLER_MEDIA_PREFIX = "/api/food/media";

/** Read a stored photo from the buyer storefront. Pass a raw storage key (e.g. `listings/<id>-card.webp`). */
export function mediaUrl(storageKey: string): string {
  return `${BUYER_MEDIA_PREFIX}/${storageKey}`;
}

/**
 * Read a stored photo from the seller surface (`portal.apoyolime.com/food`).
 *
 * ⚠ **A src that is ALREADY a root-relative URL is passed through untouched**
 * (PD-S10). Everything this app stores is a bare storage key
 * (`listings/<id>-card.webp`), so a leading `/` means the caller is naming a
 * route rather than a stored object — today that is only the demo's committed
 * photo set at `/api/food/demo-media/*`, which is repo content and has no
 * storage key at all. Without this, prefixing would produce
 * `/api/food/media//api/food/demo-media/...`, which `safeStorageKey` correctly
 * rejects and which would render every demo photo as a broken image.
 *
 * `lib/media/image-loader.ts` already makes the matching allowance one layer
 * down ("any other root-relative path bypasses storage entirely"); this closes
 * the same gap on the prefixing side so the two agree.
 */
export function sellerMediaUrl(storageKey: string): string {
  if (storageKey.startsWith("/")) return storageKey;
  return `${SELLER_MEDIA_PREFIX}/${storageKey}`;
}

/**
 * The generic authenticated upload route (order-message attachments, Fresh
 * Today posts) has real callers on EITHER surface — unlike the seller-only
 * routes below, so the caller must say which surface it's running on.
 */
export function mediaUploadUrl(surface: "buyer" | "seller"): string {
  return surface === "seller" ? "/api/food/media/upload" : "/api/media/upload";
}

/** Seller's own avatar/cover/gallery upload — this route has no buyer-surface caller. */
export const SELLER_MEDIA_UPLOAD_URL = "/api/food/seller/media";

/** Seller's own listing-photo upload — this route has no buyer-surface caller. */
export const SELLER_LISTING_MEDIA_UPLOAD_URL = "/api/food/seller/listing-media";
