import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

import { intBetween, type Rng } from "./rng";

/**
 * Where the demo seed's photography comes from.
 *
 * ⚠ **This is architecture open question 1, and it is the user's call**: the
 * arch doc asks for "curated CC0/owned food photos uploaded through the real
 * media pipeline (recommended) … or placeholder services?". Rather than answer
 * it silently, the source is a **provider interface with three
 * implementations**, chosen by `SEED_PHOTO_SOURCE`. Switching is one env var
 * plus a re-seed; nothing else in the seed knows or cares which one ran.
 *
 *   mealdb    (default) TheMealDB's free API — real, correctly-matched, genuinely
 *             appetising food photography, which is what "a full, varied,
 *             good-looking marketplace" actually requires. ⚠ Its free tier is a
 *             development/demo licence and the images are user-contributed, so
 *             this is squarely the "placeholder service" option: fine for a
 *             demo, NOT a licence to ship these as real sellers' photos.
 *   commons   Curated CC0 / public-domain Wikimedia Commons files, pinned by
 *             name in `photo-manifest.json`. This is the arch doc's recommended
 *             option and the only one with a clean licence for public use — it
 *             needs a human to curate the manifest, because Commons search is
 *             noisy enough that "pelau" returns the Republic of Palau.
 *   synthetic Offline, deterministic, no network and no licence question. Not
 *             photography and never will be — it exists so the seed can never
 *             hard-fail, and so an offline machine can still run it.
 *
 * Every provider hands back raw JPEG bytes and every byte goes through the
 * **real** Slice 4 ingest pipeline afterwards (Part C: nothing raw, everything
 * through the pipeline, seeds included). No provider ever writes to storage.
 *
 * Downloads are cached in a gitignored directory keyed by content, so the first
 * seed run needs the network and every run after it does not.
 */

export type PhotoSource = "mealdb" | "commons" | "synthetic";

export function activePhotoSource(): PhotoSource {
  const raw = (process.env.SEED_PHOTO_SOURCE ?? "mealdb").toLowerCase();
  if (raw === "commons" || raw === "synthetic" || raw === "mealdb") return raw;
  throw new Error(
    `SEED_PHOTO_SOURCE="${raw}" is not one of: mealdb | commons | synthetic`,
  );
}

const CACHE_DIR = path.join(process.cwd(), "seed-assets");
const USER_AGENT = "ApoyoFood-demo-seed/1.0 (https://food.apoyolime.com)";

async function readCache(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, `${key}.jpg`));
  } catch {
    return null;
  }
}

async function writeCache(key: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${key}.jpg`), buffer);
}

/**
 * ⚠ Bump this whenever the *selection* logic changes — which photo a ref
 * resolves to, not how it is post-processed.
 *
 * The cache is keyed on the ref, so without a version token a fix to the
 * matcher can never take effect: the improved lookup is simply never reached
 * for any ref that already has a cached file. That happened once already (the
 * word-boundary fix below landed and the contact sheet came back byte-identical),
 * which is the kind of thing that reads as "my fix didn't work" rather than as
 * "the cache did its job".
 *
 * v2 — word-boundary term matching, name-over-category preference.
 */
const SELECTION_VERSION = 2;

function cacheKey(source: PhotoSource, ref: string): string {
  const digest = crypto
    .createHash("sha1")
    .update(`v${SELECTION_VERSION}:${ref}`)
    .digest("hex")
    .slice(0, 16);
  return `${source}-${digest}`;
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// synthetic
// ---------------------------------------------------------------------------

/**
 * A warm abstract plate. Deliberately not trying to look like a photograph —
 * a bad fake photo is worse than an honest abstraction, and this exists to keep
 * the seed runnable offline rather than to fill a demo.
 */
async function synthetic(ref: string, rng: Rng): Promise<Buffer> {
  const hue = intBetween(rng, 0, 359);
  const ground = `hsl(${hue}, 32%, 34%)`;
  const plate = `hsl(${(hue + 40) % 360}, 38%, 78%)`;
  const food = `hsl(${(hue + 18) % 360}, 55%, 52%)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1500">
    <rect width="2000" height="1500" fill="${ground}"/>
    <ellipse cx="1000" cy="760" rx="620" ry="560" fill="${plate}"/>
    <ellipse cx="1000" cy="740" rx="420" ry="360" fill="${food}"/>
    <ellipse cx="860" cy="640" rx="120" ry="100" fill="${plate}" opacity="0.35"/>
    <text x="1000" y="1420" font-family="Georgia,serif" font-size="52" fill="${plate}"
      text-anchor="middle" opacity="0.75">${ref.replace(/[<>&]/g, "").slice(0, 40)}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

// ---------------------------------------------------------------------------
// mealdb
// ---------------------------------------------------------------------------

let mealdbIndex: Map<string, string[]> | null = null;

/**
 * One pass over TheMealDB's full listing, so a seed of ~50 photos makes one
 * catalogue request rather than fifty searches. Keyed by lowercase meal name;
 * the caller's `ref` is matched against it by substring.
 */
async function loadMealdbIndex(): Promise<Map<string, string[]>> {
  if (mealdbIndex) return mealdbIndex;
  const index = new Map<string, string[]>();

  // `search.php?f=<letter>` returns every meal starting with that letter, which
  // together is the whole database and is the documented way to enumerate it.
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  for (const letter of letters) {
    try {
      const response = await fetch(
        `https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`,
        { headers: { "User-Agent": USER_AGENT } },
      );
      if (!response.ok) continue;
      const body = (await response.json()) as {
        meals: { strMeal: string; strMealThumb: string; strCategory?: string; strArea?: string }[] | null;
      };
      for (const meal of body.meals ?? []) {
        // The meal NAME is weighted first and the category/area second, so a
        // term is matched against what the dish actually is before it is
        // matched against a loose grouping.
        const words = `${meal.strMeal} | ${meal.strCategory ?? ""} ${meal.strArea ?? ""}`.toLowerCase();
        const existing = index.get(words) ?? [];
        existing.push(meal.strMealThumb);
        index.set(words, existing);
      }
    } catch {
      // A single letter failing is not worth aborting the seed over.
    }
  }

  mealdbIndex = index;
  return index;
}

async function mealdb(ref: string, terms: string[], rng: Rng): Promise<Buffer> {
  const index = await loadMealdbIndex();
  const entries = [...index.entries()];

  // Positive relevance, not "the search returned something" (Apparel's Slice 8
  // lesson: a query matching a result does not mean the photo contains the
  // thing). Try each term in order of specificity and only fall back to the
  // whole pool if none of them names anything in the catalogue.
  //
  // ⚠ **Word boundaries, not substrings.** A raw `includes()` put a plate of
  // *corned beef* hash on the "grilled corn" listing and cabbage rolls on
  // "curry goat" — caught by building a contact sheet of the seeded photos and
  // looking at it, which is the only way this class of error surfaces. A
  // multi-word term matches when all of its words do, so "curry duck" prefers a
  // dish that is both.
  const matches = (haystack: string, term: string): boolean =>
    term
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack));

  let pool: string[] = [];
  for (const term of terms) {
    // Name matches beat category/area matches — `|` separates the two halves.
    const byName = entries.filter(([name]) => matches(name.split("|")[0], term));
    const byAny = entries.filter(([name]) => matches(name, term));
    pool = (byName.length > 0 ? byName : byAny).flatMap(([, urls]) => urls);
    if (pool.length > 0) break;
  }
  if (pool.length === 0) pool = entries.flatMap(([, urls]) => urls);
  if (pool.length === 0) throw new Error("TheMealDB returned an empty catalogue");

  // Deterministic pick keyed on the listing's own ref, so re-running chooses
  // the same photo for the same dish.
  const hash = crypto.createHash("sha1").update(ref).digest();
  return download(pool[hash.readUInt32BE(0) % pool.length]);
}

// ---------------------------------------------------------------------------
// commons
// ---------------------------------------------------------------------------

interface CommonsManifestEntry {
  /** Commons `File:` title, without the namespace. */
  file: string;
  /** Licence short name — the manifest must only ever contain free ones. */
  license: string;
  author?: string;
}

type CommonsManifest = Record<string, CommonsManifestEntry[]>;

let commonsManifest: CommonsManifest | null = null;

/**
 * ⚠ **Licence gate. Never relax this.** Apparel's own seed nearly shipped
 * paid-tier Unsplash+ images because its curator trusted the search endpoint;
 * the fix there was a hard allowlist, and this is the same fix. Only CC0 and
 * public-domain marks pass — CC BY and CC BY-SA are *free* licences but carry
 * attribution and share-alike obligations that a marketplace demo rendering
 * them as a seller's own photo does not discharge.
 */
const FREE_LICENSES = /^(CC0|Public domain|PDM|No restrictions)/i;

async function loadCommonsManifest(): Promise<CommonsManifest> {
  if (commonsManifest) return commonsManifest;
  const file = path.join(process.cwd(), "prisma", "seed-data", "photo-manifest.json");
  const raw = JSON.parse(await fs.readFile(file, "utf8")) as CommonsManifest;

  for (const [key, entries] of Object.entries(raw)) {
    for (const entry of entries) {
      if (!FREE_LICENSES.test(entry.license)) {
        throw new Error(
          `photo-manifest.json: "${entry.file}" (${key}) is licensed "${entry.license}", ` +
            `which is not CC0 or public domain. Remove it rather than widening the filter.`,
        );
      }
    }
  }

  commonsManifest = raw;
  return raw;
}

async function commons(ref: string, terms: string[]): Promise<Buffer> {
  const manifest = await loadCommonsManifest();
  const entries = terms.flatMap((term) => manifest[term] ?? []);
  if (entries.length === 0) {
    throw new Error(
      `photo-manifest.json has no curated file for any of: ${terms.join(", ")}. ` +
        `Add one, or run with SEED_PHOTO_SOURCE=mealdb.`,
    );
  }

  const hash = crypto.createHash("sha1").update(ref).digest();
  const chosen = entries[hash.readUInt32BE(0) % entries.length];

  const api =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=` +
    `${encodeURIComponent(`File:${chosen.file}`)}&prop=imageinfo&iiprop=url&iiurlwidth=1600`;
  const response = await fetch(api, { headers: { "User-Agent": USER_AGENT } });
  const body = (await response.json()) as {
    query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string }[] }> };
  };
  const info = Object.values(body.query?.pages ?? {})[0]?.imageinfo?.[0];
  const url = info?.thumburl ?? info?.url;
  if (!url) throw new Error(`Commons has no file named "${chosen.file}"`);
  return download(url);
}

// ---------------------------------------------------------------------------
// the one entry point
// ---------------------------------------------------------------------------

export interface PhotoRequest {
  /** Stable identity for this photo — the same ref always yields the same image. */
  ref: string;
  /** Search terms, most specific first. */
  terms: string[];
}

export interface PhotoResult {
  buffer: Buffer;
  /** Which provider actually produced it — the run prints a tally. */
  source: PhotoSource;
}

/**
 * Fetch one photo, cached.
 *
 * Falls back to `synthetic` when the chosen provider throws — a demo seed that
 * aborts halfway through because a CDN blinked leaves a half-populated database,
 * which is worse than a few abstract plates. The run reports the tally so a
 * silent slide into synthetic is visible rather than discovered at demo time.
 */
export async function fetchSeedPhoto(request: PhotoRequest, rng: Rng): Promise<PhotoResult> {
  const source = activePhotoSource();
  const key = cacheKey(source, request.ref);

  const cached = await readCache(key);
  if (cached) return { buffer: cached, source };

  try {
    let buffer: Buffer;
    if (source === "mealdb") buffer = await mealdb(request.ref, request.terms, rng);
    else if (source === "commons") buffer = await commons(request.ref, request.terms);
    else buffer = await synthetic(request.ref, rng);

    await writeCache(key, buffer);
    return { buffer, source };
  } catch (error) {
    console.warn(
      `  ! ${source} failed for "${request.ref}" (${(error as Error).message}) — using synthetic`,
    );
    const buffer = await synthetic(request.ref, rng);
    await writeCache(cacheKey("synthetic", request.ref), buffer);
    return { buffer, source: "synthetic" };
  }
}

/**
 * Push a photo through a **worse camera** before it reaches the pipeline.
 *
 * ⚠ **Seed-only. This must never move into `lib/media/`.** It models a cheaper
 * *camera*, not a different pipeline, and it deliberately runs BEFORE ingest,
 * which is the order reality applies them in.
 *
 * It exists because Part F3 stakes the whole design system on making
 * "mismatched amateur phone photos read as one set" through cream framing — and
 * a seed sourced entirely from food-photography stock would quietly remove the
 * problem the design solves, so the demo would prove nothing. Roughly half the
 * catalogue goes through here: careless framing, a small sensor's detail loss,
 * auto-exposure off by ~8%, an indoor colour cast, and messaging-app
 * recompression.
 */
export async function degradeToPhoneCamera(buffer: Buffer, rng: Rng): Promise<Buffer> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const width = meta.width ?? 1600;
  const height = meta.height ?? 1200;

  // Careless framing: crop 84-96% of the frame, off-centre.
  const scale = 0.84 + rng() * 0.12;
  const cropW = Math.max(64, Math.floor(width * scale));
  const cropH = Math.max(64, Math.floor(height * scale));
  const left = Math.floor((width - cropW) * rng());
  const top = Math.floor((height - cropH) * rng());

  return sharp(buffer)
    .extract({ left, top, width: cropW, height: cropH })
    // Small sensor: downscale hard, then back up. Detail does not come back.
    .resize({ width: Math.max(320, Math.floor(cropW * 0.45)) })
    .resize({ width: cropW })
    .modulate({
      brightness: 0.92 + rng() * 0.16, // auto-exposure miss
      saturation: 0.88 + rng() * 0.24, // indoor colour cast
    })
    // Messaging-app recompression, which is how most of these actually arrive.
    .jpeg({ quality: intBetween(rng, 58, 74) })
    .toBuffer();
}
