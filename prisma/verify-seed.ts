/**
 * Demo-seed verification — `npm run verify:seed`.
 *
 * Proves the things Slice 8's done-when actually asks for, by reading the
 * database and the files on disk rather than by trusting the seeder's own
 * console output. A seeder that prints "✔ 50 listings" has proved that it
 * printed something.
 *
 * `--hash` prints a content digest instead of running the assertions; seeding
 * twice and comparing the two digests is what proves idempotency (identical row
 * counts alone do not — a re-run that reshuffles every timestamp also keeps the
 * counts).
 */

import fs from "fs/promises";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

import { resolveStorageKey } from "../lib/storage";
import { formatCentsTtd } from "../lib/money";

const prisma = new PrismaClient();
sharp.cache(false);

let passes = 0;
const failures: string[] = [];

function check(ok: boolean, label: string, detail?: string) {
  if (ok) {
    passes += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/**
 * A digest over everything a re-run must not change. Deliberately includes
 * `createdAt` — the whole point is that a demo's "posted 3 days ago" holds
 * still — and the photo storage keys, which would change on any re-ingest
 * because `writeMediaVariant` mints a fresh filename per call.
 */
async function contentHash(): Promise<string> {
  const [sellers, listings, photos, windows, stories] = await Promise.all([
    prisma.foodSeller.findMany({
      where: { id: { startsWith: "seed-" } },
      orderBy: { id: "asc" },
      select: { id: true, slug: true, status: true, followerCount: true, createdAt: true, profileImageCard: true },
    }),
    prisma.foodListing.findMany({
      where: { id: { startsWith: "seed-" } },
      orderBy: { id: "asc" },
      select: { id: true, slug: true, priceCents: true, priceMode: true, active: true, createdAt: true },
    }),
    prisma.foodListingPhoto.findMany({
      where: { id: { startsWith: "seed-" } },
      orderBy: { id: "asc" },
      select: { id: true, pathThumb: true, pathCard: true, pathFull: true, sortOrder: true },
    }),
    prisma.foodAvailabilityWindow.findMany({
      where: { id: { startsWith: "seed-" } },
      orderBy: { id: "asc" },
      select: { id: true, type: true, daysOfWeek: true, startsOn: true, endsOn: true, leadTimeDays: true },
    }),
    prisma.foodStory.findMany({
      where: { id: { startsWith: "seed-" } },
      orderBy: { id: "asc" },
      select: { id: true, caption: true, pathCard: true, createdAt: true, highlightId: true },
    }),
  ]);

  return crypto
    .createHash("md5")
    .update(JSON.stringify({ sellers, listings, photos, windows, stories }))
    .digest("hex");
}

async function run() {
  section("Shape");
  const sellers = await prisma.foodSeller.findMany({
    where: { id: { startsWith: "seed-" } },
    include: {
      listings: { include: { photos: true, availabilityWindows: true, categories: true } },
      stories: true,
      highlights: true,
    },
  });

  check(sellers.length >= 8 && sellers.length <= 14, `8-12ish sellers (${sellers.length})`);
  const activeSellers = sellers.filter((s) => s.status === "ACTIVE");
  check(activeSellers.length >= 8, `at least 8 ACTIVE sellers (${activeSellers.length})`);

  const allListings = sellers.flatMap((s) => s.listings);
  check(allListings.length >= 40, `40+ listings (${allListings.length})`);

  section("The two deliberate traps for later slices");
  const suspended = sellers.find((s) => s.slug === "mama-lin-kitchen");
  check(suspended?.status === "SUSPENDED", "a SUSPENDED seller exists");
  check(
    (suspended?.listings.filter((l) => l.active).length ?? 0) > 0,
    "…and it still has ACTIVE listings (Slice 9 must filter on the SELLER's standing)",
    `${suspended?.listings.filter((l) => l.active).length} active listings`,
  );
  const pending = sellers.find((s) => s.slug === "pastelitos-y-mas");
  check(pending?.status === "PENDING", "a PENDING seller exists (Slice 16's queue)");
  check((pending?.listings.length ?? 0) > 0, "…and it has listings that must not be discoverable");

  section("Areas (Part C: 1-3, and a concentration for the collective views)");
  check(
    sellers.every((s) => s.areas.length >= 1 && s.areas.length <= 3),
    "every seller has 1-3 areas",
    sellers.filter((s) => s.areas.length < 1 || s.areas.length > 3).map((s) => s.slug).join(", "),
  );
  const perArea = new Map<string, number>();
  for (const seller of activeSellers) {
    for (const area of seller.areas) perArea.set(area, (perArea.get(area) ?? 0) + 1);
  }
  const busiest = [...perArea.entries()].sort((a, b) => b[1] - a[1])[0];
  check(
    (busiest?.[1] ?? 0) >= 3,
    `at least one area has 3+ ACTIVE sellers (${busiest?.[0]} = ${busiest?.[1]})`,
  );

  section("Pricing (Part D + the €-mockup trap)");
  check(
    allListings.every((l) => (l.priceMode === "QUOTE") === (l.priceCents === null)),
    "priceCents is NULL if and only if the mode is QUOTE",
  );
  check(
    allListings.every((l) => l.priceCents === null || l.priceCents >= 0),
    "no negative prices",
  );
  check(
    allListings.every((l) => l.priceCents === null || l.priceCents % 100 === 0),
    "every price is a whole TTD amount in integer cents",
  );
  const modes = new Set(allListings.map((l) => l.priceMode));
  check(modes.size === 3, `all three price modes present (${[...modes].join(", ")})`);
  const kinds = new Set(allListings.map((l) => l.kind));
  check(kinds.size >= 4, `at least 4 listing kinds present (${[...kinds].join(", ")})`);
  const sample = allListings.find((l) => l.priceCents === 12000);
  check(
    formatCentsTtd(sample?.priceCents ?? 0) === "$120 TTD",
    "prices render through lib/money.ts as $X,XXX TTD",
    formatCentsTtd(sample?.priceCents ?? 0),
  );

  section("Photos — every listing has one, through the real pipeline");
  const discoverable = activeSellers.flatMap((s) => s.listings.filter((l) => l.active));
  const withoutPhoto = discoverable.filter((l) => l.photos.length === 0);
  check(withoutPhoto.length === 0, "every discoverable listing has >=1 photo", withoutPhoto.map((l) => l.slug).join(", "));
  const allPhotos = allListings.flatMap((l) => l.photos);
  check(
    allPhotos.every((p) => p.pathThumb && p.pathCard && p.pathFull && p.blurDataUrl.startsWith("data:image/")),
    "every photo carries all three variants plus a real blur placeholder",
  );
  check(
    allPhotos.every((p) => p.pathThumb.endsWith(".webp") && p.pathCard.endsWith(".webp")),
    "every stored variant is pipeline-produced .webp (nothing raw was written)",
  );

  // The files must actually be on disk at the pipeline's own dimensions —
  // a database row pointing at nothing renders as a broken image, which is
  // exactly what a demo cannot afford.
  const spotChecks = allPhotos.slice(0, 6);
  for (const photo of spotChecks) {
    const resolved = resolveStorageKey(photo.pathCard);
    let ok = false;
    let detail = "not on disk";
    if (resolved) {
      try {
        const meta = await sharp(await fs.readFile(resolved)).metadata();
        ok = meta.width === 800 && meta.height === 600;
        detail = `${meta.width}x${meta.height}`;
      } catch (error) {
        detail = (error as Error).message;
      }
    }
    check(ok, `card variant on disk at 800x600 (${photo.id.slice(0, 40)})`, detail);
  }

  section("Photo quality is measurably MIXED, not asserted to be");
  // Part F3 stakes the design system on cream framing unifying mismatched
  // amateur phone photos. A catalogue sourced entirely from food-photography
  // stock silently removes the problem the design exists to solve.
  const sizes: number[] = [];
  for (const photo of allPhotos) {
    const resolved = resolveStorageKey(photo.pathCard);
    if (!resolved) continue;
    try {
      sizes.push((await fs.stat(resolved)).size);
    } catch {
      /* counted as missing above */
    }
  }
  sizes.sort((a, b) => a - b);
  const p25 = sizes[Math.floor(sizes.length * 0.25)] ?? 0;
  const p75 = sizes[Math.floor(sizes.length * 0.75)] ?? 0;
  check(
    p75 > p25 * 1.6,
    `card variants at identical 800x600 span a real quality range (p25 ${Math.round(p25 / 1024)}KB vs p75 ${Math.round(p75 / 1024)}KB)`,
    `ratio ${(p75 / Math.max(p25, 1)).toFixed(2)}`,
  );

  section("Availability — the discovery sections must be non-empty on ANY demo day");
  const windows = discoverable.flatMap((l) => l.availabilityWindows);
  for (let day = 0; day < 7; day += 1) {
    const open = discoverable.filter((l) =>
      l.availabilityWindows.some(
        (w) => w.type === "RECURRING_WEEKLY" && w.daysOfWeek !== null && (w.daysOfWeek & (1 << day)) !== 0,
      ),
    );
    check(open.length >= 3, `>=3 listings recur on day ${day} (${open.length})`);
  }
  check(
    windows.some((w) => w.type === "PREORDER" && w.leadTimeDays !== null),
    "PREORDER windows exist with a lead time",
  );
  const seasonal = windows.filter((w) => w.type === "DATE_RANGE");
  check(seasonal.length > 0, `DATE_RANGE (seasonal) windows exist (${seasonal.length})`);
  check(
    seasonal.every((w) => w.startsOn !== null && w.endsOn !== null && w.startsOn < w.endsOn),
    "every seasonal window runs forwards with both bounds set",
  );
  check(
    seasonal.every((w) => w.endsOn! >= new Date(new Date().toDateString())),
    "no seasonal window has already expired (the seed resolves them to the NEXT occurrence)",
  );

  section("Fresh Today (Part E2) + the Menu shelf");
  const stories = sellers.flatMap((s) => s.stories);
  check(stories.length >= 8, `a spread of Fresh Today entries (${stories.length})`);
  check(
    stories.every((s) => s.expiresAt.getUTCFullYear() >= 2027),
    "seeded far-future so they survive until Slice 15 rewrites them",
  );
  check(stories.some((s) => s.linkedListingId !== null), "some entries link through to a listing");
  check(stories.some((s) => s.highlightId !== null), "some entries are kept on the Menu shelf");
  const highlights = sellers.flatMap((s) => s.highlights);
  check(highlights.length >= 6, `Menu-shelf groups exist (${highlights.length})`);
  check(
    activeSellers.filter((s) => s.lastStoryAt !== null).length >= 5,
    "posting bumped lastStoryAt (Part E2: presence, not a demand event)",
  );

  section("Engagement");
  for (const seller of sellers) {
    const real = await prisma.foodFollow.count({ where: { sellerId: seller.id } });
    if (seller.followerCount !== real) {
      check(false, `${seller.slug}: followerCount agrees with the follow rows`, `${seller.followerCount} vs ${real}`);
    }
  }
  check(
    (await Promise.all(sellers.map(async (s) => s.followerCount === (await prisma.foodFollow.count({ where: { sellerId: s.id } }))))).every(Boolean),
    "every followerCount is recounted from the table, not trusted from the catalogue",
  );
  check((await prisma.foodSave.count({ where: { id: { startsWith: "seed-" } } })) > 50, "saves are seeded");

  section("Bilingual authorship (Part E3: one language per listing, discovery bridges them)");
  const spanish = allListings.filter((l) => /[áéíóúñ¿¡]/i.test(`${l.title} ${l.description}`));
  check(spanish.length >= 10, `Spanish-authored listings exist (${spanish.length})`);
  check(allListings.length - spanish.length >= 20, `English-authored listings exist (${allListings.length - spanish.length})`);

  section("Removability");
  const strays = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM food_listings WHERE id NOT LIKE 'seed-%'`,
  );
  check(Number(strays[0].count) === 0, "no non-seed listings exist in this dev database");
  check(
    sellers.every((s) => s.id.startsWith("seed-")) && allListings.every((l) => l.id.startsWith("seed-")),
    "every seeded row carries the `seed-` prefix, so one command removes exactly it",
  );

  console.log(`\n${passes} pass, ${failures.length} fail`);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

async function main() {
  if (process.argv.includes("--hash")) {
    console.log(await contentHash());
    return;
  }
  await run();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
