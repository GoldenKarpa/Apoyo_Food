import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

import { FoodImage, type FoodImageAspect } from "@/components/food-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUploadsBase } from "@/lib/storage";
import {
  ingestMealPhoto,
  ingestSellerAvatar,
  ingestSellerCover,
  ingestStoryPhoto,
  type PhotoVariantPaths,
} from "@/lib/media/ingest";

/**
 * ⚠ SCAFFOLDING WITH A SCHEDULED DEATH — Slice 7 deletes this alongside
 * `token-proof.tsx` and `surface-banner.tsx`, once real seeded media (Slice 8)
 * renders through the real components.
 *
 * It exists so Slice 4's "`<FoodImage>` renders blur-up in a test page"
 * criterion is checkable in a browser rather than only in a script's output. On
 * first load it generates a synthetic photo, pushes it through the REAL ingest
 * pipeline once, and caches the resulting variant keys + blurDataUrl next to the
 * uploads directory. Every later load only reads that cache — so the blur-up you
 * see is genuinely a stored LQIP being replaced by a stored variant, which is
 * exactly the production path.
 */

const MARKER = "_media-proof.json";

type ProofEntry = PhotoVariantPaths & { label: string; aspect: FoodImageAspect };

async function markerPath(): Promise<string> {
  return path.join(getUploadsBase(), MARKER);
}

/** A synthetic but genuinely photographic-ish source: warm ground + an off-centre subject. */
async function makeSourceImage(): Promise<Buffer> {
  const subject = await sharp({
    create: { width: 900, height: 900, channels: 3, background: { r: 137, g: 92, b: 26 } },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width: 2400, height: 1800, channels: 3, background: { r: 83, g: 109, b: 70 } },
  })
    .composite([{ input: subject, top: 420, left: 1100 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function buildProof(): Promise<ProofEntry[]> {
  const source = await makeSourceImage();
  const [meal, cover, avatar, story] = await Promise.all([
    ingestMealPhoto(source, "image/jpeg"),
    ingestSellerCover(source, "image/jpeg"),
    ingestSellerAvatar(source, "image/jpeg"),
    ingestStoryPhoto(source, "image/jpeg"),
  ]);
  return [
    { ...meal, label: "meal · 4:3", aspect: "meal" },
    { ...cover, label: "seller cover · 16:9", aspect: "cover" },
    { ...avatar, label: "avatar · 1:1", aspect: "thumb" },
    { ...story, label: "Fresh Today · 4:5", aspect: "story" },
  ];
}

async function loadOrBuildProof(): Promise<ProofEntry[]> {
  const marker = await markerPath();
  try {
    return JSON.parse(await fs.readFile(marker, "utf8")) as ProofEntry[];
  } catch {
    const entries = await buildProof();
    await fs.mkdir(path.dirname(marker), { recursive: true });
    await fs.writeFile(marker, JSON.stringify(entries, null, 2));
    return entries;
  }
}

export async function MediaProof() {
  const entries = await loadOrBuildProof();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media pipeline</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-label text-ink-muted">
          Ingested once through the real pipeline (EXIF stripped, variants + LQIP), then served by
          the local-disk driver. Each frame below blurs up from its stored placeholder.
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {entries.map((entry) => (
            <figure key={entry.label} className="flex flex-col gap-2">
              <FoodImage
                src={entry.pathCard}
                alt={entry.label}
                aspect={entry.aspect}
                blurDataUrl={entry.blurDataUrl}
                sizes="(min-width: 768px) 25vw, 50vw"
              />
              <figcaption className="text-caption text-ink-muted">
                {entry.label} · {entry.width}×{entry.height}
              </figcaption>
            </figure>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
