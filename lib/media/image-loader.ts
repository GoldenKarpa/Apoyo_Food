/**
 * Custom `next/image` loader — "pointed at whichever driver is active"
 * (Slice 4), wired via `images.loaderFile` in next.config.ts.
 *
 * It does two jobs:
 *
 *  1. **Serves the right pre-built variant for the requested width.** The ingest
 *     pipeline already produced thumb/card/full at fixed sizes, so running
 *     Next's own optimizer over them would be redundant work on every request
 *     (and on the VPS, that is CPU nobody is paying for). Instead the loader
 *     rewrites the variant suffix on the key: a 300px slot gets `-thumb`, a
 *     1200px hero gets `-full`. This is why `lib/storage.ts` shares ONE media id
 *     across an image's variants — with per-variant ids, one key could not name
 *     its siblings and this loader would be impossible.
 *
 *  2. **Keeps the storage backend a config change.** The base URL is the only
 *     thing that moves when local disk becomes R2 + a CDN domain:
 *       local disk (today) → "/api/media"   (app/api/media/[...path] serves it)
 *       R2 + CDN (later)   → "https://media.apoyolime.com"
 *     No component changes either way.
 *
 * ⚠ Seller-surface `<FoodImage surface="seller">` calls already prefix `src`
 * with `/api/food/media` (`lib/media-url.ts`'s `sellerMediaUrl`, ecosystem
 * ruling E14) before it ever reaches this loader — the ONLY way the seller
 * surface's photos are reachable at all when rendered via
 * `portal.apoyolime.com/food`. That prefix is recognised below and stripped
 * before `resolveVariantKey` runs, then reattached, so variant selection keeps
 * working for seller-surface images too instead of silently passing the
 * pre-prefixed src straight through.
 *
 * ⚠ This module runs in the CLIENT bundle, so it must stay dependency-free (no
 * `fs`, no `@/lib/storage` import — that module imports `fs/promises`) and may
 * only read `NEXT_PUBLIC_*` env vars. `lib/media-url.ts` is safe to import here
 * for the same reason — it has no server-only dependencies either.
 */

import { BUYER_MEDIA_PREFIX, SELLER_MEDIA_PREFIX } from "@/lib/media-url";

/** Must match the variant ladder in lib/media/ingest.ts. */
const VARIANT_WIDTHS: readonly { suffix: string; width: number }[] = [
  { suffix: "thumb", width: 400 },
  { suffix: "card", width: 800 },
  { suffix: "full", width: 1600 },
];

const KNOWN_SUFFIXES = VARIANT_WIDTHS.map((v) => v.suffix);

/** Smallest variant that is at least as wide as the slot; else the largest. */
function suffixForWidth(width: number): string {
  const match = VARIANT_WIDTHS.find((v) => v.width >= width);
  return (match ?? VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]).suffix;
}

/**
 * Rewrites `listings/<id>-card.webp` → `listings/<id>-thumb.webp` for the
 * requested width. Any src that isn't a recognisably-suffixed storage key is
 * passed through untouched, so an absolute URL or a static asset still works.
 */
export function resolveVariantKey(src: string, width: number): string {
  const match = /^(.*)-([a-z]+)\.(webp|jpg|jpeg)$/i.exec(src);
  if (!match) return src;

  const [, stem, suffix, extension] = match;
  if (!KNOWN_SUFFIXES.includes(suffix.toLowerCase())) return src;

  return `${stem}-${suffixForWidth(width)}.${extension}`;
}

export default function foodImageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  if (/^https?:\/\//i.test(src)) return src;

  // Seller-surface src already carries the /api/food/media prefix
  // (lib/media-url.ts's sellerMediaUrl) — swap the variant suffix on the
  // storage-key portion, then reattach the exact same prefix.
  if (src.startsWith(`${SELLER_MEDIA_PREFIX}/`)) {
    const key = src.slice(SELLER_MEDIA_PREFIX.length + 1);
    return `${SELLER_MEDIA_PREFIX}/${resolveVariantKey(key, width)}`;
  }

  // Any other root-relative path (a static asset, or an already-absolute URL
  // this loader doesn't own) bypasses storage entirely.
  if (src.startsWith("/")) return src;

  return `${BUYER_MEDIA_PREFIX}/${resolveVariantKey(src, width)}`;
}
