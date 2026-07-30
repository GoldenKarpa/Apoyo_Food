/**
 * Slice 4 verification — proves the media pipeline's hard guarantees against
 * real files on real disk, not by inspection.
 *
 * The headline claim is a SECURITY one (architecture Part G): home cooks
 * photograph food in their homes, so a surviving GPS tag is a doxxed kitchen.
 * That claim is only worth anything if the fixture genuinely carried GPS to
 * begin with — so this script builds a REAL JPEG with a REAL GPS EXIF block
 * (piexifjs), independently confirms the tag is present by scanning raw bytes,
 * and only then runs it through the pipeline.
 *
 * Run: npm run verify:media
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import piexif from "piexifjs";

import { getUploadsBase, readMedia, safeStorageKey, deleteMedia } from "../lib/storage";
import { ingestMealPhoto, ingestSellerAvatar, ingestSellerCover, ingestStoryPhoto } from "../lib/media/ingest";
import { resolveVariantKey } from "../lib/media/image-loader";

// ⚠ Windows-only, and it cost Apparel real debugging time: sharp/libvips holds
// native file handles in an internal operation cache for the PROCESS's
// lifetime, not transiently, so this script's own cleanup hits EBUSY on every
// file it tries to delete. Disabling the cache releases handles per-operation.
// Irrelevant on the Linux VPS; needed for any verification script run on this
// machine.
sharp.cache(false);

let pass = 0;
let fail = 0;
function assert(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n${title}`);
}

/** Raw-byte scan for embedded EXIF, format-agnostic and reader-independent. */
function hasExifBytes(buffer: Buffer): boolean {
  // JPEG: APP1 marker (FFE1) followed by the "Exif\0\0" identifier.
  for (let i = 0; i < buffer.length - 10; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xe1) {
      if (buffer.slice(i + 4, i + 8).toString("ascii") === "Exif") return true;
    }
  }
  // WEBP: an "EXIF" FourCC chunk in the RIFF container.
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.includes(Buffer.from("EXIF", "ascii"))) {
    return true;
  }
  return false;
}

/** A real JPEG carrying a real GPS EXIF block. */
async function makeGpsTaggedJpeg(): Promise<Buffer> {
  // A landscape photo-ish source: a gradient, so smart-cropping has something
  // to work with and the output is a genuine image rather than a flat colour.
  const base = await sharp({
    create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 800, height: 800, channels: 3, background: { r: 40, g: 90, b: 50 } },
        })
          .png()
          .toBuffer(),
        top: 500,
        left: 800,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  // Port of Spain, roughly — the coordinates matter only in that they exist.
  const exif = {
    "0th": { [piexif.ImageIFD.Make]: "VerifyCam", [piexif.ImageIFD.Orientation]: 1 },
    Exif: {},
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [[10, 1], [39, 1], [0, 1]],
      [piexif.GPSIFD.GPSLongitudeRef]: "W",
      [piexif.GPSIFD.GPSLongitude]: [[61, 1], [31, 1], [0, 1]],
    },
    Interop: {},
    "1st": {},
    // `thumbnail` is omitted rather than set to null: @types/piexifjs types it
    // as `string | undefined`, and a null there is a type error even though
    // piexifjs itself tolerates it at runtime.
  };

  // piexifjs works on binary STRINGS, not Buffers.
  const binary = base.toString("binary");
  const withExif = piexif.insert(piexif.dump(exif), binary);
  return Buffer.from(withExif, "binary");
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function main() {
  const uploadsBase = getUploadsBase();
  console.log(`uploads base: ${uploadsBase}`);
  const writtenKeys: string[] = [];

  // ==========================================================================
  section("Fixture — the GPS tag must genuinely be there BEFORE the pipeline");
  // ==========================================================================
  const original = await makeGpsTaggedJpeg();
  assert("fixture is a real JPEG", original[0] === 0xff && original[1] === 0xd8);
  assert("fixture carries EXIF (raw APP1 byte scan)", hasExifBytes(original));
  const readBack = piexif.load(original.toString("binary"));
  const gpsTagCount = Object.keys(readBack.GPS ?? {}).length;
  assert("fixture's GPS block is readable and non-empty (piexifjs)", gpsTagCount >= 4, { gpsTagCount });

  const filesBefore = (await walk(uploadsBase)).length;

  // ==========================================================================
  section("Ingest — variants, dimensions, blur");
  // ==========================================================================
  const meal = await ingestMealPhoto(original, "image/jpeg");
  writtenKeys.push(meal.pathThumb, meal.pathCard, meal.pathFull);

  assert("three variant keys returned", !!meal.pathThumb && !!meal.pathCard && !!meal.pathFull);
  assert(
    "…all three share ONE media id (what makes the custom loader possible)",
    meal.pathThumb.replace(/-thumb\.webp$/, "") === meal.pathCard.replace(/-card\.webp$/, ""),
    { thumb: meal.pathThumb, card: meal.pathCard },
  );
  assert("…and are well-formed storage keys", [meal.pathThumb, meal.pathCard, meal.pathFull].every((k) => safeStorageKey(k) !== null));

  for (const [name, key, w, h] of [
    ["thumb", meal.pathThumb, 400, 300],
    ["card", meal.pathCard, 800, 600],
    ["full", meal.pathFull, 1600, 1200],
  ] as const) {
    const { buffer, exists } = await readMedia(key);
    assert(`meal ${name} exists on disk`, exists);
    const meta = await sharp(buffer).metadata();
    assert(`meal ${name} is exactly ${w}x${h} (4:3)`, meta.width === w && meta.height === h, {
      width: meta.width,
      height: meta.height,
    });
    assert(`meal ${name} is webp`, meta.format === "webp", meta.format);
  }

  assert("blur placeholder is a base64 JPEG data URL", meal.blurDataUrl.startsWith("data:image/jpeg;base64,"));
  const blurBuffer = Buffer.from(meal.blurDataUrl.split(",")[1], "base64");
  const blurMeta = await sharp(blurBuffer).metadata();
  assert("…decodes as a real image at the 4:3 ratio", blurMeta.width === 16 && blurMeta.height === 12, {
    width: blurMeta.width,
    height: blurMeta.height,
  });
  assert("…and is small enough to inline", blurBuffer.length < 2048, { bytes: blurBuffer.length });

  // ==========================================================================
  section("EXIF/GPS is GONE from every stored variant (Part G hard requirement)");
  // ==========================================================================
  for (const [name, key] of [
    ["thumb", meal.pathThumb],
    ["card", meal.pathCard],
    ["full", meal.pathFull],
  ] as const) {
    const { buffer } = await readMedia(key);
    assert(`meal ${name}: no EXIF in the raw output bytes`, !hasExifBytes(buffer));
    const meta = await sharp(buffer).metadata();
    assert(`meal ${name}: sharp reports no exif block either`, meta.exif === undefined, { exif: !!meta.exif });
  }
  assert("blur placeholder carries no EXIF either", !hasExifBytes(blurBuffer));

  // ==========================================================================
  section("Other presets keep their Part F3 aspect ratios");
  // ==========================================================================
  for (const [label, fn, w, h] of [
    ["avatar 1:1", ingestSellerAvatar, 800, 800],
    ["cover 16:9", ingestSellerCover, 800, 450],
    ["story 4:5", ingestStoryPhoto, 800, 1000],
  ] as const) {
    const result = await fn(original, "image/jpeg");
    writtenKeys.push(result.pathThumb, result.pathCard, result.pathFull);
    const { buffer } = await readMedia(result.pathCard);
    const meta = await sharp(buffer).metadata();
    assert(`${label}: card variant is ${w}x${h}`, meta.width === w && meta.height === h, {
      width: meta.width,
      height: meta.height,
    });
    assert(`${label}: EXIF stripped`, !hasExifBytes(buffer));
  }

  // ==========================================================================
  section("The original bytes were NEVER written anywhere");
  // ==========================================================================
  const allFiles = await walk(uploadsBase);
  let originalFound = false;
  let nonWebp: string | null = null;
  for (const file of allFiles) {
    const contents = await fs.readFile(file);
    if (contents.equals(original)) originalFound = true;
    if (!file.endsWith(".webp")) nonWebp = file;
  }
  assert("the uploaded buffer appears nowhere on disk, byte-for-byte", !originalFound);
  assert("every file in the uploads tree is a pipeline-produced .webp", nonWebp === null, { nonWebp });
  assert("…and the file count grew by exactly the variants written", allFiles.length === filesBefore + writtenKeys.length, {
    before: filesBefore,
    after: allFiles.length,
    written: writtenKeys.length,
  });

  // ==========================================================================
  section("Bad uploads are rejected before anything touches disk");
  // ==========================================================================
  const countBeforeBad = (await walk(uploadsBase)).length;
  for (const [label, buf, mime] of [
    ["garbage bytes declared as jpeg", Buffer.from("not an image at all, really"), "image/jpeg"],
    ["a real jpeg declared as png (magic mismatch)", original, "image/png"],
    ["a disallowed type", original, "image/gif"],
    ["an oversized file", Buffer.alloc(11 * 1024 * 1024, 1), "image/jpeg"],
  ] as const) {
    let rejected = false;
    try {
      await ingestMealPhoto(buf as Buffer, mime);
    } catch {
      rejected = true;
    }
    assert(`rejected: ${label}`, rejected);
  }
  assert(
    "…and none of them wrote a file",
    (await walk(uploadsBase)).length === countBeforeBad,
    { before: countBeforeBad, after: (await walk(uploadsBase)).length },
  );

  // ==========================================================================
  section("Traversal guard");
  // ==========================================================================
  const payloads = [
    "../../../etc/passwd",
    "listings/../../secret.webp",
    "/etc/passwd",
    "listings/..%2F..%2Fsecret.webp",
    "listings/../secret.webp",
    "..\\..\\windows\\system32\\config\\sam",
    "listings/sub/dir/file.webp",
    "notacategory/file.webp",
    "listings/.hidden",
    "listings/",
  ];
  for (const payload of payloads) {
    assert(`rejected key: ${payload}`, safeStorageKey(payload) === null);
  }
  assert("…while a legitimate key still resolves", safeStorageKey(meal.pathCard) !== null);

  // ==========================================================================
  section("next/image loader picks the right pre-built variant");
  // ==========================================================================
  const cardKey = meal.pathCard;
  assert("a 300px slot resolves to -thumb", resolveVariantKey(cardKey, 300).endsWith("-thumb.webp"));
  assert("a 400px slot resolves to -thumb (boundary, inclusive)", resolveVariantKey(cardKey, 400).endsWith("-thumb.webp"));
  assert("a 401px slot resolves to -card", resolveVariantKey(cardKey, 401).endsWith("-card.webp"));
  assert("a 1200px slot resolves to -full", resolveVariantKey(cardKey, 1200).endsWith("-full.webp"));
  assert("an oversized slot clamps to -full", resolveVariantKey(cardKey, 4000).endsWith("-full.webp"));
  assert(
    "…and the rewritten key still points at the same media id",
    resolveVariantKey(cardKey, 300).replace(/-thumb\.webp$/, "") === cardKey.replace(/-card\.webp$/, ""),
  );
  assert("a non-variant src passes through untouched", resolveVariantKey("/logo.svg", 300) === "/logo.svg");

  // ==========================================================================
  section("Cleanup");
  // ==========================================================================
  for (const key of writtenKeys) await deleteMedia(key);
  const leftovers = (await walk(uploadsBase)).length;
  assert("every file this script wrote was removed", leftovers === filesBefore, { leftovers, filesBefore });

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
