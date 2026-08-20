/**
 * PD-S10 — builds the seller demo's committed photo set.
 *
 *   node scripts/build-demo-assets.mjs
 *
 * ## ⚠ Why this is not the seed's photo pipeline
 *
 * `prisma/seed-data/photos.ts` defaults to **TheMealDB**, and its own header is
 * explicit that this is "squarely the placeholder-service option: fine for a
 * demo, NOT a licence to ship these as real sellers' photos". It also caches
 * into `seed-assets/`, which `.gitignore` excludes on purpose — that directory
 * is a local download cache, not repo content, and nothing in it has ever been
 * committed.
 *
 * The provider demo needs the opposite of both: a SMALL, COMMITTED set that
 * exists in a fresh checkout and on a rebuilt server, under a licence that
 * survives being served from a public host to signed-in strangers. So this
 * script uses the seed's OTHER, licence-clean source — **Wikimedia Commons**,
 * which `photos.ts` already calls "the arch doc's recommended option and the
 * only one with a clean licence for public use" — pinned by exact file title
 * rather than searched, because that same note records why search is unusable
 * here ("Commons search is noisy enough that 'pelau' returns the Republic of
 * Palau").
 *
 * ## ⚠ The licence check is an assertion, not a formality
 *
 * Every pinned file's licence is re-read from Commons at build time and must be
 * in `ALLOWED_LICENCES`. A file whose licence changed, or which was replaced by
 * a re-upload under different terms, FAILS THE BUILD rather than quietly
 * shipping. The resulting attribution lands in `manifest.json` and is rendered
 * by the demo (`foodDemo.photoCredits`) — CC BY / CC BY-SA both require credit,
 * so the credit line is part of the deliverable, not decoration.
 *
 * ## Output
 *
 * `demo-assets/<slot>.webp` plus `demo-assets/manifest.json`. Both ARE
 * committed — they are repo content, like Apparel's `demo-assets/` (PD-S9).
 *
 * ⚠ Filenames deliberately carry NO `-thumb`/`-card`/`-full` suffix.
 * `lib/media/image-loader.ts` rewrites any src matching `<stem>-<known
 * suffix>.webp` into a different variant; an unsuffixed name is passed through
 * untouched, which is exactly what a demo URL that is not a storage key needs.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = {
  "User-Agent": "ApoyoFood-demo-asset-build/1.0 (https://food.apoyolime.com)",
};
const OUT_DIR = path.join(process.cwd(), "demo-assets");

/**
 * CC BY and CC BY-SA both permit commercial use and modification with credit;
 * CC0 and public-domain need none. Anything else — non-commercial, no-derivs,
 * fair-use tags, unknown — is refused, because this set is served publicly and
 * resized (a derivative work).
 */
const ALLOWED_LICENCES = new Set([
  "cc0",
  "public domain",
  "cc by 2.0",
  "cc by 3.0",
  "cc by 4.0",
  "cc by-sa 2.0",
  "cc by-sa 3.0",
  "cc by-sa 4.0",
]);

/** Target boxes, matching `<FoodImage>`'s aspect locks (Part F3). */
const BOX = {
  meal: { w: 1000, h: 750 }, //  4:3 — listing cards and the meal hero
  cover: { w: 1280, h: 720 }, // 16:9 — seller cover
  avatar: { w: 480, h: 480 }, //  1:1 — seller avatar, message attachment thumb
  story: { w: 720, h: 900 }, //  4:5 — Fresh Today
};

/**
 * ⚠ Pinned by exact Commons title. Never replace one with a search — see the
 * header. Subjects are Trinidadian and Venezuelan home cooking, matching the
 * market `prisma/seed-data/catalog.ts` models (Trini bakers and street-food
 * sellers, Venezuelan migrant cooks).
 */
const PINNED = [
  { slot: "doubles", aspect: "meal", title: "File:Doubles at Debe Market.jpg" },
  {
    slot: "pelau",
    aspect: "meal",
    title: "File:Dish of pelau, coleslaw, cassava pone, and a mac and cheese pie.jpg",
  },
  {
    slot: "roti",
    aspect: "meal",
    title: "File:Dhalpurie Roti, Pumpkin, Channa and Potato, Curry Goat, Trinidad and Tobago.JPG",
  },
  { slot: "blackcake", aspect: "meal", title: "File:Bolo pretu.jpg" },
  { slot: "avatar", aspect: "avatar", title: "File:MISC Bake & Shark.jpg" },
  {
    slot: "cover",
    aspect: "cover",
    title: "File:San Fernando, Trinidad & Tobago - Amin's Roti Shop.jpg",
  },
  { slot: "story1", aspect: "story", title: "File:Arepas filled with ham and cheese.jpg" },
  { slot: "story2", aspect: "story", title: "File:Arepa filled with queso llanero.jpg" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => (html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function imageInfo(title) {
  const url =
    `${API}?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size` +
    `&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Commons API ${res.status} for ${title}`);
  const data = await res.json();
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined) throw new Error(`Commons file not found: ${title}`);
  const ii = page.imageinfo?.[0];
  if (!ii) throw new Error(`no imageinfo for ${title}`);
  const meta = ii.extmetadata ?? {};
  return {
    url: ii.url,
    licence: strip(meta.LicenseShortName?.value) || "unknown",
    licenceUrl: strip(meta.LicenseUrl?.value) || "",
    artist: strip(meta.Artist?.value) || "unknown",
    descriptionUrl: ii.descriptionurl,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const photos = [];

  for (const pin of PINNED) {
    process.stdout.write(`  ${pin.slot} ... `);
    const info = await imageInfo(pin.title);

    if (!ALLOWED_LICENCES.has(info.licence.toLowerCase())) {
      throw new Error(
        `REFUSED: ${pin.title} is "${info.licence}", which is not in the allowed set. ` +
          `Pin a different file rather than widening ALLOWED_LICENCES.`,
      );
    }

    const bin = await fetch(info.url, { headers: UA });
    if (!bin.ok) throw new Error(`download ${bin.status} for ${pin.title}`);
    const source = Buffer.from(await bin.arrayBuffer());

    const box = BOX[pin.aspect];
    const file = `${pin.slot}.webp`;
    // `attention` matches the ingest pipeline's own smart crop, so a demo photo
    // is framed the way a real uploaded one would be.
    const out = await sharp(source)
      .rotate()
      .resize(box.w, box.h, { fit: "cover", position: sharp.strategy.attention })
      .webp({ quality: 74 })
      .toBuffer();
    await writeFile(path.join(OUT_DIR, file), out);

    // 16px-wide base64 LQIP — the same width and format `lib/media/ingest.ts`
    // produces, so `<FoodImage>`'s blur-up behaves identically here.
    const blurH = Math.max(1, Math.round((16 * box.h) / box.w));
    const blur = await sharp(source)
      .rotate()
      .resize(16, blurH, { fit: "cover", position: sharp.strategy.attention })
      .jpeg({ quality: 40 })
      .toBuffer();

    photos.push({
      slot: pin.slot,
      file,
      aspect: pin.aspect,
      width: box.w,
      height: box.h,
      blurDataUrl: `data:image/jpeg;base64,${blur.toString("base64")}`,
      source: { title: pin.title, page: info.descriptionUrl },
      licence: info.licence,
      licenceUrl: info.licenceUrl,
      artist: info.artist,
    });
    console.log(`ok  [${info.licence}] ${info.artist}`);
    // Commons rate-limits an unthrottled loop hard enough to return HTML.
    await sleep(1500);
  }

  await writeFile(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        note:
          "PD-S10 demo photo set. Built by scripts/build-demo-assets.mjs from PINNED " +
          "Wikimedia Commons files. Every entry's licence was re-verified at build time " +
          "against ALLOWED_LICENCES. Credits are rendered by the demo - do not drop them.",
        builtAt: new Date().toISOString(),
        photos,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n${photos.length} photos -> demo-assets/`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
