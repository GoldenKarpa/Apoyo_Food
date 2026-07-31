import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

import {
  ingestCategoryHero,
  ingestMealPhoto,
  ingestSellerAvatar,
  ingestSellerCover,
  ingestStoryPhoto,
  type PhotoVariantPaths,
} from "@/lib/media/ingest";
import { getUploadsBase } from "@/lib/storage";

/**
 * Sample imagery for the style guide.
 *
 * ⚠ **These are synthetic images, not photographs, and they must not become the
 * pattern for any.** Slice 8's curated seed supplies real photography, and Part
 * C's rule is absolute: nothing raw, everything through the ingest pipeline,
 * seeds included.
 *
 * They exist because a card component cannot be verified without an image in
 * it, and no photo exists yet to put there. The important part is what happens
 * to them: they go through the **real** Slice 4 pipeline — the real presets, the
 * real variant ladder, the real EXIF-stripping re-encode, the real blur
 * placeholder — and are served by the real storage driver through the real
 * `next/image` loader. So the blur-up on screen is the production path, exactly
 * as `components/scaffold/media-proof.tsx` established for Slice 4, rather than
 * an inline data-URI standing in for one. (Apparel's equivalent page used inline
 * gradient SVGs; Food has a working pipeline and no reason to bypass it.)
 *
 * Ingest runs **once**. The resulting keys are cached in the uploads root and
 * every later render only reads that JSON — otherwise an unlinked build-tool
 * page would re-encode two dozen images on every request. Delete the cache file
 * to regenerate.
 */

const CACHE_FILE = "_style-guide-media.json";

export interface SampleMedia {
  meals: PhotoVariantPaths[];
  covers: PhotoVariantPaths[];
  avatars: PhotoVariantPaths[];
  stories: PhotoVariantPaths[];
  categories: PhotoVariantPaths[];
}

/**
 * Warm, food-ish grounds drawn from the Sobremesa palette itself, so the
 * gallery reads as one set the way real photography framed in cream is meant to
 * (Part F3: "consistent cream framing unifies mismatched amateur phone photos").
 */
const PALETTES: [number, number, number][][] = [
  [
    [154, 76, 54],
    [221, 162, 74],
  ],
  [
    [137, 92, 26],
    [245, 230, 201],
  ],
  [
    [61, 109, 104],
    [220, 232, 229],
  ],
  [
    [83, 109, 70],
    [228, 234, 220],
  ],
  [
    [192, 101, 74],
    [240, 218, 209],
  ],
  [
    [78, 140, 134],
    [137, 92, 26],
  ],
];

/**
 * A synthetic but genuinely photographic-shaped source: a warm ground with an
 * off-centre subject, large enough that the 1600px `full` variant is a real
 * downscale rather than an upscale.
 */
async function makeSource(index: number): Promise<Buffer> {
  const [ground, subject] = PALETTES[index % PALETTES.length];

  const blob = await sharp({
    create: {
      width: 1100,
      height: 1100,
      channels: 3,
      background: { r: subject[0], g: subject[1], b: subject[2] },
    },
  })
    .composite([
      {
        // A soft radial-ish highlight, so the blur placeholder has something to
        // resolve *into* and the blur-up is visible rather than a flat colour
        // becoming the same flat colour.
        input: Buffer.from(
          `<svg width="1100" height="1100"><circle cx="430" cy="380" r="300" fill="rgb(${ground[0]},${ground[1]},${ground[2]})" opacity="0.85"/></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 2400,
      height: 2400,
      channels: 3,
      background: { r: ground[0], g: ground[1], b: ground[2] },
    },
  })
    .composite([{ input: blob, top: 620, left: 560 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function build(): Promise<SampleMedia> {
  const sources = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => makeSource(i)));

  const [meals, covers, avatars, stories, categories] = await Promise.all([
    Promise.all(sources.slice(0, 4).map((s) => ingestMealPhoto(s, "image/jpeg"))),
    Promise.all(sources.slice(0, 2).map((s) => ingestSellerCover(s, "image/jpeg"))),
    Promise.all(sources.slice(2, 4).map((s) => ingestSellerAvatar(s, "image/jpeg"))),
    Promise.all(sources.slice(0, 4).map((s) => ingestStoryPhoto(s, "image/jpeg"))),
    Promise.all(sources.slice(2, 6).map((s) => ingestCategoryHero(s, "image/jpeg"))),
  ]);

  return { meals, covers, avatars, stories, categories };
}

export async function getSampleMedia(): Promise<SampleMedia | null> {
  const cachePath = path.join(getUploadsBase(), CACHE_FILE);

  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8")) as SampleMedia;
  } catch {
    // Not cached yet — build it.
  }

  try {
    const media = await build();
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(media, null, 2));
    return media;
  } catch (error) {
    // A build tool must never take the page down. Every card component in this
    // library renders a sunken frame at the correct aspect when it has no
    // photo (a real state — a seller mid-onboarding, Slice 13), so a failure
    // here degrades the gallery rather than breaking it.
    console.error("[style-guide] sample media unavailable:", error);
    return null;
  }
}
