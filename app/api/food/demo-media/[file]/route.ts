import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import demoAssets from "@/demo-assets/manifest.json";

/**
 * PD-S10 — serves the seller demo's committed photo set.
 *
 * ## ⚠ Why this is a separate route from `/api/food/media/*`
 *
 * That route reads the `uploads/` tree, which `.gitignore` excludes (Part C/G:
 * filesystem media is never committed) and which does not exist in a fresh
 * checkout or on a rebuilt server. The demo's photos are REPO content, not
 * uploaded media, and `safeStorageKey`'s two-segment `<category>/<file>` shape
 * with its fixed category allow-list correctly refuses anything else. Widening
 * that list to smuggle demo files into the uploads tree would mix committed
 * assets into the one directory the whole app treats as disposable.
 *
 * ## ⚠ Why it lives under `/api/food/*` and nowhere else
 *
 * The demo runs on `portal.apoyolime.com`, where nginx proxies only `/food/*`
 * and `/api/food/*` to this app (`DEPLOYMENT.md` §6b, ecosystem ruling E14). A
 * `public/` file, or a route under any other prefix, would resolve against
 * portal-web and 404 — the exact production-only failure `lib/media-url.ts`
 * exists to prevent. Both work locally, because one origin serves both
 * surfaces in dev, so this cannot be caught by testing here.
 *
 * ## ⚠ Deliberately NOT session-gated
 *
 * Same conclusion `lib/media/serve.ts` reaches for the storefront's own photos
 * ("not auth-gated ... gating one copy while the other is open would be
 * security theatre"). Nothing is disclosed: these are eight Wikimedia Commons
 * photographs under CC BY / CC BY-SA, already public at their source. The
 * demo's *content* — the fixtures, the fictional seller, the conversation — is
 * behind `resolveDemoAccess()` on the page, which is where the secret actually
 * is.
 *
 * ⚠ Note this app uses a CUSTOM `next/image` loader, so unlike Apparel there is
 * no Next optimizer fetching these server-side without cookies. The browser
 * requests them directly. That removes the mechanical reason a gate here would
 * break, and leaves only the reason above — which is sufficient on its own.
 *
 * ## The allow-list IS the traversal guard
 *
 * Only filenames present in the committed manifest are ever served, so there is
 * no path arithmetic to get wrong: `..`, absolute paths and nested segments all
 * simply fail the set-membership test.
 */

const ALLOWED = new Set(demoAssets.photos.map((photo) => photo.file));
const DEMO_ASSETS_DIR = path.join(process.cwd(), "demo-assets");

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!ALLOWED.has(file)) {
    return new NextResponse(null, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(DEMO_ASSETS_DIR, file));
  } catch {
    // A committed file missing from disk means a broken checkout or a partial
    // deploy, not a bad request — a 404 is still the right answer to the
    // browser, and this log line is what says which of the two it was.
    console.error(`[demo] demo asset missing from disk: ${file}`);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      // WARNING: NOT `immutable`, and the distinction is not pedantry.
      // These filenames are SLOT names (`doubles.webp`), not content hashes, so
      // the same URL legitimately serves different bytes after a re-run of
      // `scripts/build-demo-assets.mjs`. `immutable` tells a browser it may
      // never revalidate, which would strand a replaced photo in caches for as
      // long as the max-age says - a year, in the first version of this file.
      // A day plus revalidation keeps it cheap without lying about what the URL
      // means. (Apparel's PD-S9 review found the identical wrong claim in its
      // own copy of this route.)
      "Cache-Control": "public, max-age=86400, must-revalidate",
    },
  });
}
