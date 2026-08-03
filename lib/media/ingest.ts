import sharp from "sharp";
import { assertImageUploadValid } from "./validate";
import { newMediaId, writeMediaVariant, type MediaCategory } from "@/lib/storage";

/**
 * The ingest engine (architecture Part C + G): validate → auto-orient → strip
 * ALL metadata → cover-fit smart-cropped variants → base64 blur placeholder.
 *
 * ⚠ **EXIF stripping is a HARD SECURITY REQUIREMENT here, not a nice-to-have**
 * (Part G). Home cooks photograph food *in their homes*; a geotagged photo is a
 * doxxed kitchen, and Food's whole privacy stance — profiles expose AREA only,
 * exact pickup location is exchanged in the order thread after acceptance —
 * collapses if a GPS tag survives ingest. See `verifiedNoMetadata` below for
 * exactly why it is gone, and `scripts/verify-media.ts` for the proof against a
 * genuinely GPS-tagged JPEG.
 *
 * Presets live at the bottom. Adding one is a small wrapper around
 * `ingestImage`, never new pipeline code.
 */

export interface VariantSpec {
  suffix: string;
  width: number;
  height: number;
}

interface IngestedVariant {
  key: string;
  width: number;
  height: number;
}

export interface IngestImageOptions {
  category: MediaCategory;
  variants: readonly VariantSpec[];
  /** Pixel width of the blur placeholder; height derives from the LARGEST variant's ratio. */
  blurWidth: number;
}

export interface IngestImageResult {
  mediaId: string;
  variants: Record<string, IngestedVariant>;
  blurDataUrl: string;
  /** The largest variant's actual output dimensions — the "canonical" size. */
  width: number;
  height: number;
}

/**
 * Why metadata is provably gone rather than assumed gone:
 *
 *  1. `.rotate()` with no arguments applies the EXIF Orientation tag to the
 *     PIXELS first, so a portrait phone photo doesn't come out sideways once the
 *     tag itself is discarded. Order matters — this must happen BEFORE output.
 *  2. `.withMetadata()` is never called anywhere in this pipeline. That omission
 *     is the actual mechanism: sharp discards EXIF (including GPS), ICC and XMP
 *     on output unless explicitly told to carry them over.
 *
 * Both halves are asserted in scripts/verify-media.ts against a real GPS-tagged
 * fixture, by scanning the OUTPUT BYTES for the JPEG APP1 marker and the WEBP
 * `EXIF` chunk — not by trusting sharp's own metadata reader to tell the truth
 * about its own output.
 */
export async function ingestImage(
  buffer: Buffer,
  declaredMimeType: string,
  options: IngestImageOptions,
): Promise<IngestImageResult> {
  assertImageUploadValid(buffer, declaredMimeType);

  const rotated = await sharp(buffer).rotate().toBuffer();
  const mediaId = newMediaId();

  const variantEntries = await Promise.all(
    options.variants.map(async (spec) => {
      const { data, info } = await sharp(rotated)
        .resize(spec.width, spec.height, {
          fit: "cover",
          // Saliency crop, not a fixed gravity — for food photography the dish
          // is rarely dead-centre, and Part F3 makes "forgiving of amateur
          // phone photos" a design principle rather than an aspiration.
          position: sharp.strategy.attention,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });

      const key = await writeMediaVariant(options.category, mediaId, spec.suffix, data, "webp");
      return [spec.suffix, { key, width: info.width, height: info.height }] as const;
    }),
  );
  const variants = Object.fromEntries(variantEntries);

  // Blur placeholder: a tiny, heavily-compressed JPEG (smaller than webp at this
  // size) inlined as base64. Part F3 makes the blur-up reveal load-bearing —
  // "never spinners on the browse surface, skeletons + blur-up only" — so this
  // is a product requirement, not an optimisation.
  const largestSpec = options.variants.reduce((a, b) => (a.width > b.width ? a : b));
  const blurHeight = Math.max(1, Math.round((options.blurWidth * largestSpec.height) / largestSpec.width));
  const blurBuffer = await sharp(rotated)
    .resize(options.blurWidth, blurHeight, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 40 })
    .toBuffer();
  const blurDataUrl = `data:image/jpeg;base64,${blurBuffer.toString("base64")}`;

  const canonical = variants[largestSpec.suffix];
  return { mediaId, variants, blurDataUrl, width: canonical.width, height: canonical.height };
}

// ── Presets (architecture Part F3 imagery ratios) ───────────────────────────
//
// The variant ladder is thumb 400w / card 800w / full 1600w everywhere, matching
// next.config.ts's `deviceSizes` so next/image never asks for a size the
// pipeline didn't produce. Only the ASPECT differs per preset.

/** Meals: 4:3 — abundance/table energy, Part F3's deliberate divergence from Apparel's 4:5. */
const MEAL_VARIANTS: readonly VariantSpec[] = [
  { suffix: "thumb", width: 400, height: 300 },
  { suffix: "card", width: 800, height: 600 },
  { suffix: "full", width: 1600, height: 1200 },
];

/** Seller cover: 16:9. */
const COVER_VARIANTS: readonly VariantSpec[] = [
  { suffix: "thumb", width: 400, height: 225 },
  { suffix: "card", width: 800, height: 450 },
  { suffix: "full", width: 1600, height: 900 },
];

/** Avatars: 1:1. */
const AVATAR_VARIANTS: readonly VariantSpec[] = [
  { suffix: "thumb", width: 400, height: 400 },
  { suffix: "card", width: 800, height: 800 },
  { suffix: "full", width: 1600, height: 1600 },
];

/**
 * Fresh Today entries: 4:5 portrait.
 *
 * ⚠ A judgement call worth knowing about. Part F3's imagery line says "avatars &
 * Fresh Today thumbnails 1:1", which describes how the RAIL CARD presents the
 * image — and it still does: `<FreshTodayCard>` renders the thumb variant inside
 * a `.aspect-thumb` box, a CSS crop. But the same photo also fills the
 * FULL-SCREEN viewer (Part E2), and storing it square would mean either heavy
 * upscaling or throwing away most of a portrait phone photo before it ever
 * reaches the viewer. Storing 4:5 serves both: the card crops to square for
 * presentation, the viewer gets real pixels. If a later slice decides the viewer
 * should be square too, changing this one array is the whole change.
 */
const STORY_VARIANTS: readonly VariantSpec[] = [
  { suffix: "thumb", width: 400, height: 500 },
  { suffix: "card", width: 800, height: 1000 },
  { suffix: "full", width: 1600, height: 2000 },
];

/**
 * Order-thread attachments (Slice 18): 1:1, same numeric ladder as every other
 * preset (400/800/1600 — required for `lib/media/image-loader.ts`'s width
 * thresholds to select the right variant regardless of aspect).
 *
 * ⚠ A "cake design reference" photo has no natural reason to be square, and
 * cropping COULD cut off the exact detail the photo was sent to show — but
 * this preset uses `fit: "cover"` (the saliency crop every other preset uses)
 * rather than inventing an aspect-preserving mode. Two reasons: Part F3's own
 * design principle is consistent cream framing across mismatched amateur
 * photos, which this keeps true for message attachments too; and
 * `sharp.strategy.attention` smart-crops toward the photo's own most visually
 * interesting region, which is the mitigation that makes "cover" acceptable
 * here rather than a compromise. If a future slice finds this crops out real
 * information, an `inside`-fit mode is a contained change to `ingestImage`'s
 * options, not a rewrite.
 */
const ATTACHMENT_VARIANTS: readonly VariantSpec[] = [
  { suffix: "thumb", width: 400, height: 400 },
  { suffix: "card", width: 800, height: 800 },
  { suffix: "full", width: 1600, height: 1600 },
];

/**
 * EXACTLY the four columns every photo-bearing model in Part D stores — no more.
 *
 * ⚠ That exactness is the point, and it was a Phase-0 review fix. This type
 * previously also carried `width`/`height`, which **no table has columns for**,
 * so the natural call site —
 *   `prisma.foodListingPhoto.create({ data: { listingId, ...await ingestMealPhoto(...) } })`
 * — would have thrown at runtime on unknown fields, in the exact slice most
 * likely to write it that way (Slice 14). Keeping this shape congruent with the
 * schema makes the spread correct by construction instead of a trap.
 *
 * Dimensions are still available on `IngestImageResult` for anything that
 * genuinely needs them. Nothing persisted does: `<FoodImage>` locks the aspect
 * ratio in CSS and uses `fill`, so intrinsic dimensions would be dead columns.
 */
export interface PhotoVariantPaths {
  pathThumb: string;
  pathCard: string;
  pathFull: string;
  blurDataUrl: string;
}

function toPhotoPaths(result: IngestImageResult): PhotoVariantPaths {
  return {
    pathThumb: result.variants.thumb.key,
    pathCard: result.variants.card.key,
    pathFull: result.variants.full.key,
    blurDataUrl: result.blurDataUrl,
  };
}

/** `FoodListingPhoto` — 4:3 meal photography. */
export async function ingestMealPhoto(buffer: Buffer, mimeType: string): Promise<PhotoVariantPaths> {
  return toPhotoPaths(
    await ingestImage(buffer, mimeType, { category: "listings", variants: MEAL_VARIANTS, blurWidth: 16 }),
  );
}

/** `FoodSellerPhoto` — the profile gallery; also food shots, so also 4:3. */
export async function ingestSellerGalleryPhoto(buffer: Buffer, mimeType: string): Promise<PhotoVariantPaths> {
  return toPhotoPaths(
    await ingestImage(buffer, mimeType, { category: "sellers", variants: MEAL_VARIANTS, blurWidth: 16 }),
  );
}

/** `FoodSeller.profileImage*` — 1:1 avatar. */
export async function ingestSellerAvatar(buffer: Buffer, mimeType: string): Promise<PhotoVariantPaths> {
  return toPhotoPaths(
    await ingestImage(buffer, mimeType, { category: "sellers", variants: AVATAR_VARIANTS, blurWidth: 16 }),
  );
}

/** `FoodSeller.coverImage*` — 16:9 cover. */
export async function ingestSellerCover(buffer: Buffer, mimeType: string): Promise<PhotoVariantPaths> {
  return toPhotoPaths(
    await ingestImage(buffer, mimeType, { category: "sellers", variants: COVER_VARIANTS, blurWidth: 16 }),
  );
}

/** `FoodStory` — the Fresh Today entry image (4:5, see STORY_VARIANTS). */
export async function ingestStoryPhoto(buffer: Buffer, mimeType: string): Promise<PhotoVariantPaths> {
  return toPhotoPaths(
    await ingestImage(buffer, mimeType, { category: "stories", variants: STORY_VARIANTS, blurWidth: 16 }),
  );
}

/** `FoodCategory.heroImage` — 16:9 category landing hero (seeded, Slice 8). */
export async function ingestCategoryHero(buffer: Buffer, mimeType: string): Promise<PhotoVariantPaths> {
  return toPhotoPaths(
    await ingestImage(buffer, mimeType, { category: "categories", variants: COVER_VARIANTS, blurWidth: 16 }),
  );
}

/**
 * `FoodOrderMessage.attachmentPath` — order-thread photo attachments (Slice
 * 18). ⚠ The schema stores only ONE path (unlike every other photo entity's
 * three-column set), but the `card` key persisted here still has its `thumb`/
 * `full` siblings written to storage under the same shared media id — the
 * loader's suffix-swap can still serve them if a future slice adds a zoom/
 * lightbox, without a second ingest or a schema change.
 */
export async function ingestMessageAttachment(buffer: Buffer, mimeType: string): Promise<PhotoVariantPaths> {
  return toPhotoPaths(
    await ingestImage(buffer, mimeType, { category: "orders", variants: ATTACHMENT_VARIANTS, blurWidth: 16 }),
  );
}

/** Every preset, by name — used by the upload route's `kind` parameter. */
export const INGEST_PRESETS = {
  meal: ingestMealPhoto,
  "seller-gallery": ingestSellerGalleryPhoto,
  "seller-avatar": ingestSellerAvatar,
  "seller-cover": ingestSellerCover,
  story: ingestStoryPhoto,
  "category-hero": ingestCategoryHero,
  message: ingestMessageAttachment,
} as const;

export type IngestPresetName = keyof typeof INGEST_PRESETS;

export function isIngestPreset(value: string): value is IngestPresetName {
  return value in INGEST_PRESETS;
}
