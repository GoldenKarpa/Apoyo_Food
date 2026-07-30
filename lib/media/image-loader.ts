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
 * ⚠ This module runs in the CLIENT bundle, so it must stay dependency-free (no
 * `fs`, no `@/lib/storage` import — that module imports `fs/promises`) and may
 * only read `NEXT_PUBLIC_*` env vars.
 */

/** Must match the variant ladder in lib/media/ingest.ts. */
const VARIANT_WIDTHS: readonly { suffix: string; width: number }[] = [
  { suffix: "thumb", width: 400 },
  { suffix: "card", width: 800 },
  { suffix: "full", width: 1600 },
];

const KNOWN_SUFFIXES = VARIANT_WIDTHS.map((v) => v.suffix);

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_MEDIA_BASE_URL || "/api/media";
}

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
  // Absolute URLs and root-relative static assets bypass storage entirely.
  if (/^https?:\/\//i.test(src) || src.startsWith("/")) return src;
  return `${baseUrl()}/${resolveVariantKey(src, width)}`;
}
