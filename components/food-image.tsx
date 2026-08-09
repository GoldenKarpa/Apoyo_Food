import Image from "next/image";

import { cn } from "@/lib/utils";
import { sellerMediaUrl } from "@/lib/media-url";

/**
 * The one way Food renders stored media (architecture Part F3).
 *
 * Bundles the three things that are easy to forget individually and that the
 * design system treats as non-negotiable:
 *   - **blur-up**, never a spinner ("skeletons + blur-up only" on browse
 *     surfaces). The `blurDataUrl` comes from the ingest pipeline, so it is
 *     always present for pipeline-produced media.
 *   - the **aspect lock** for the image's role — 4:3 meals, 16:9 covers, 1:1
 *     avatars and Fresh Today thumbs — so a mis-sized image can never break the
 *     grid rhythm even if storage somehow held the wrong ratio.
 *   - **cream framing + 16px image radius**, which is what makes mismatched
 *     amateur phone photos read as one coherent set. Part F3 is explicit that
 *     "photography is the design system"; this component is where that claim is
 *     actually enforced rather than hoped for.
 *
 * `src` is a STORAGE KEY (e.g. `listings/<id>-card.webp`), not a URL —
 * `lib/media/image-loader.ts` turns it into one and picks the right variant for
 * the rendered width, so callers never build media URLs by hand.
 *
 * ⚠ `surface` picks WHICH read path that URL uses (ecosystem ruling E14).
 * Defaults to `"buyer"` (Food's own domain, unprefixed) — every pre-existing
 * call site keeps working unchanged. Pass `surface="seller"` for anything
 * rendered under `app/food/*`, which in production is reachable ONLY via
 * `portal.apoyolime.com/food`; the buyer-prefixed path 404s from there.
 */

const ASPECT_CLASS = {
  meal: "aspect-meal", //  4:3
  cover: "aspect-cover", // 16:9
  thumb: "aspect-thumb", //  1:1
  story: "aspect-[4/5]", //  4:5 — the Fresh Today viewer's portrait frame
} as const;

export type FoodImageAspect = keyof typeof ASPECT_CLASS;

export interface FoodImageProps {
  /** Storage key from the ingest pipeline, e.g. `listings/<id>-card.webp`. */
  src: string;
  alt: string;
  aspect: FoodImageAspect;
  /** Base64 LQIP from the pipeline. Omit only for media that has none. */
  blurDataUrl?: string | null;
  /**
   * Responsive slot description for srcset selection. Defaults to a
   * mobile-first full-width-then-card guess; pass a real value on grids.
   */
  sizes?: string;
  /** Above-the-fold hero images only — everything else stays lazy (Part F3). */
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  /** Which surface is rendering this — picks the reachable read path (E14). Defaults to the buyer storefront. */
  surface?: "buyer" | "seller";
}

export function FoodImage({
  src,
  alt,
  aspect,
  blurDataUrl,
  sizes = "(min-width: 768px) 50vw, 100vw",
  priority = false,
  className,
  imageClassName,
  surface = "buyer",
}: FoodImageProps) {
  return (
    <div
      className={cn(
        // The cream frame: a `card`-surface box with the Part F3 image radius.
        // `overflow-hidden` is what makes the radius actually clip the photo.
        "relative overflow-hidden rounded-image bg-card",
        ASPECT_CLASS[aspect],
        className,
      )}
    >
      <Image
        src={surface === "seller" ? sellerMediaUrl(src) : src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        // `placeholder="blur"` requires blurDataURL; when a piece of media has
        // none, fall back to no placeholder rather than passing an empty string
        // (which next/image rejects at runtime).
        {...(blurDataUrl ? { placeholder: "blur" as const, blurDataURL: blurDataUrl } : {})}
        className={cn("object-cover", imageClassName)}
      />
    </div>
  );
}
