import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Storage abstraction (architecture Part C). **Local disk is the default and
 * only implementation today** — the same proven pattern Salon, Portal and
 * Apparel all use — and R2 + a CDN custom domain is a documented future swap,
 * deliberately NOT a Phase-0 dependency (the R2 account does not exist yet, and
 * a demo must not block on provisioning one).
 *
 * The whole point of this module is that **no caller ever touches a filesystem
 * path directly**: every write returns a storage-relative KEY (what Prisma's
 * `path*` columns store), and every read goes through `resolveStorageKey`,
 * which is also the traversal guard. When R2 replaces local disk this is the
 * one module that changes — the ingest pipeline, the serve route, the image
 * loader and every future seed script are unaffected, because none of them
 * construct or parse a filesystem path themselves.
 *
 * ⚠ "No raw uploads anywhere, including seeds" (BUILD_SLICES.md conventions) is
 * enforced STRUCTURALLY, not by discipline: this module deliberately has no
 * "write the original bytes" function. The only writer is the ingest pipeline
 * (lib/media/ingest.ts), and it only ever calls in with pipeline output —
 * EXIF-stripped, cropped, re-encoded. There is no code path that CAN persist an
 * unprocessed upload.
 */

/** Maps 1:1 to architecture Part D's photo-bearing entities. */
export type MediaCategory = "listings" | "sellers" | "stories" | "categories" | "orders";

const VALID_CATEGORIES: readonly MediaCategory[] = [
  "listings",
  "sellers",
  "stories",
  "categories",
  "orders",
];

export function getUploadsBase(): string {
  return process.env.UPLOADS_BASE_PATH ?? path.join(process.cwd(), "uploads");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * One id per SOURCE IMAGE, shared by all of its variants.
 *
 * ⚠ This is a deliberate divergence from Apparel, which mints a fresh UUID per
 * *variant*. Sharing the id is what makes `lib/media/image-loader.ts` possible:
 * the loader can swap `-thumb` for `-card` on the same key to serve the right
 * size for a requested width. With per-variant ids, one variant's key tells you
 * nothing about its siblings' keys, and a custom next/image loader cannot work
 * at all. Slice 4's brief asks for that loader, so the ids are shared.
 */
export function newMediaId(): string {
  return crypto.randomUUID();
}

/**
 * Writes pipeline output under `category/`, returning the STORAGE KEY (a
 * relative path like `listings/<id>-thumb.webp`) — this, not a filesystem path,
 * is what gets stored in `FoodListingPhoto.pathThumb` etc.
 *
 * The filename is built from a generated id plus a variant suffix — never
 * derived from the original upload's filename, which is attacker-controlled
 * input and irrelevant to storage identity.
 */
export async function writeMediaVariant(
  category: MediaCategory,
  mediaId: string,
  suffix: string,
  buffer: Buffer,
  extension: "webp" | "jpg" = "webp",
): Promise<string> {
  const dir = path.join(getUploadsBase(), category);
  await ensureDir(dir);
  const filename = `${mediaId}-${suffix}.${extension}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return path.posix.join(category, filename);
}

/**
 * Validates a storage key is exactly `<category>/<plain-filename>` — no `..`,
 * no absolute paths, no extra segments, no leading dot. Returns the
 * OS-appropriate relative path, or `null` if the key is malformed in any way.
 */
export function safeStorageKey(key: string): string | null {
  const segments = key.split("/");
  if (segments.length !== 2) return null;

  const [category, filename] = segments;
  if (!VALID_CATEGORIES.includes(category as MediaCategory)) return null;

  const base = path.basename(filename);
  if (base !== filename) return null; // caught a path separator or ".."
  if (!/^[a-zA-Z0-9._-]+$/.test(base) || base.startsWith(".")) return null;

  return path.join(category, base);
}

/**
 * Resolves a storage key to an absolute filesystem path, or `null` if the key
 * would escape the uploads base — the traversal guard every read goes through.
 *
 * Two independent checks, deliberately redundant: `safeStorageKey` rejects
 * anything that isn't `category/plain-filename` shaped BEFORE it ever reaches
 * `path.join`, and the resolved-path prefix check catches anything that somehow
 * still slipped through (defence in depth, matching Demia's `lib/uploads.ts`
 * `safeFilename` precedent).
 */
export function resolveStorageKey(key: string): string | null {
  const safe = safeStorageKey(key);
  if (!safe) return null;

  const base = getUploadsBase();
  const resolved = path.resolve(base, safe);
  const baseResolved = path.resolve(base);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    return null;
  }
  return resolved;
}

export async function readMedia(key: string): Promise<{ buffer: Buffer; exists: boolean }> {
  const resolved = resolveStorageKey(key);
  if (!resolved) return { buffer: Buffer.alloc(0), exists: false };
  try {
    return { buffer: await fs.readFile(resolved), exists: true };
  } catch {
    return { buffer: Buffer.alloc(0), exists: false };
  }
}

export async function deleteMedia(key: string): Promise<void> {
  const resolved = resolveStorageKey(key);
  if (!resolved) return;
  await fs.unlink(resolved).catch(() => {});
}
