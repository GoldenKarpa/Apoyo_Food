/**
 * The curated demo marketplace seed — architecture Phase 1.
 *
 *   npm run db:seed:demo         populate (idempotent, re-runnable)
 *   npm run db:seed:demo:clear   remove every row it created, and only those
 *
 * ⚠ **This is NOT `prisma/seed.ts`.** That file seeds the category taxonomy and
 * is safe and expected to run in production. This one writes throwaway fixture
 * data standing in for real seller content until Phase 2, and every row it
 * creates carries a `seed-` id prefix so the clear command can remove exactly
 * it. Never run this against a database that has real sellers on it.
 *
 * ── Idempotency, and what makes it hold ──
 * Seeding twice must produce byte-identical content, not merely "not crash".
 * Three rules, all of which a later edit could break silently:
 *  1. Every generated value is a pure function of a **per-entity** RNG stream
 *     (`rngFor(label)` in `seed-data/rng.ts`). ⚠ A single `Math.random()`
 *     breaks this invisibly — and so does threading ONE shared stream through
 *     the run, which is what the first version did and which produced a real
 *     P2002 on the second seed: photos are ingested on CREATE only, so a re-run
 *     skips those draws and shifts every downstream number. See `rngFor`.
 *  2. Rows are upserted on deterministic `seed-*` ids. Content fields ARE
 *     updated, so editing the catalogue and re-running applies the change.
 *  3. **Timestamps and photos are written on CREATE only.** Timestamps because
 *     a re-run must not shuffle a demo's "posted 3 days ago"; photos because
 *     `writeMediaVariant` mints a fresh filename per call, so re-ingesting would
 *     pile up orphaned files on disk forever.
 * `prisma/verify-seed.ts` proves the property by content hash across two runs.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import sharp from "sharp";

import {
  ingestCategoryHero,
  ingestMealPhoto,
  ingestSellerAvatar,
  ingestSellerCover,
  ingestSellerGalleryPhoto,
  ingestStoryPhoto,
  type PhotoVariantPaths,
} from "../lib/media/ingest";
import {
  SELLERS,
  listingId,
  sellerId,
  type ListingSpec,
  type SellerSpec,
  type WindowSpec,
} from "./seed-data/catalog";
import {
  activePhotoSource,
  degradeToPhoneCamera,
  fetchSeedPhoto,
  type PhotoSource,
} from "./seed-data/photos";
import { demoUserId, intBetween, rngFor, type Rng } from "./seed-data/rng";

const prisma = new PrismaClient();

// sharp/libvips holds native file handles in a process-lifetime cache; a script
// that ingests many files on Windows hits EBUSY without this (Slice 4 finding).
sharp.cache(false);

/** Fresh Today entries are seeded far-future so they survive until Slice 15. */
const STORY_EXPIRY = new Date("2027-12-31T00:00:00.000Z");

const tally: Record<PhotoSource, number> = { mealdb: 0, commons: 0, synthetic: 0 };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a catalogue `-MM-DD` into a real calendar date.
 *
 * Seasonal windows are authored without a year so the seed does not go stale in
 * January. The year chosen is the one that puts the window **next**: if this
 * year's range has already closed, roll to next year, so a demo run in July
 * shows Christmas hampers as an upcoming season rather than an expired one.
 *
 * `@db.Date` columns hold pure calendar dates in America/Port_of_Spain (Slice
 * 2), so these are constructed as UTC midnight and never as instants.
 */
function resolveSeasonalRange(startsOn: string, endsOn: string, today: Date) {
  const year = today.getUTCFullYear();
  const build = (y: number, spec: string) => new Date(`${y}${spec}T00:00:00.000Z`);
  let start = build(year, startsOn);
  let end = build(year, endsOn);
  // A range that wraps the new year (e.g. -11-15 .. -01-10) must still run
  // forwards, which the DB constraint enforces.
  if (end <= start) end = build(year + 1, endsOn);
  if (end < today) {
    start = build(year + 1, startsOn);
    end = build(year + 2, endsOn);
    if (end <= start) end = build(year + 1, endsOn);
  }
  return { start, end };
}

function windowData(spec: WindowSpec, today: Date) {
  if (spec.type === "DATE_RANGE") {
    const { start, end } = resolveSeasonalRange(spec.startsOn!, spec.endsOn!, today);
    return {
      type: spec.type,
      daysOfWeek: null,
      startsOn: start,
      endsOn: end,
      leadTimeDays: spec.leadTimeDays ?? null,
      note: spec.note ?? null,
    };
  }
  return {
    type: spec.type,
    daysOfWeek: spec.type === "RECURRING_WEEKLY" ? (spec.daysOfWeek ?? null) : null,
    startsOn: null,
    endsOn: null,
    leadTimeDays: spec.leadTimeDays ?? null,
    note: spec.note ?? null,
  };
}

/** Days ago, as a deterministic instant. */
function daysAgo(days: number, hours = 9): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hours, 0, 0, 0);
  return d;
}

type Ingestor = (buffer: Buffer, mime: string) => Promise<PhotoVariantPaths>;

/**
 * Fetch → optionally degrade → ingest through the REAL pipeline.
 *
 * `crop` produces a listing's *second* frame from the same source: real cooks
 * shoot a wide plate shot and then a close-up, and with one source per dish a
 * crop is genuinely what that second frame looks like — so Slice 10's gallery
 * strip does not show the same picture twice.
 */
async function ingestPhoto(
  ref: string,
  terms: string[],
  ingestor: Ingestor,
  rng: Rng,
  opts: { amateur?: boolean; crop?: boolean } = {},
): Promise<PhotoVariantPaths> {
  const { buffer, source } = await fetchSeedPhoto({ ref, terms }, rng);
  tally[source] += 1;

  let bytes = buffer;

  if (opts.crop) {
    const meta = await sharp(bytes).metadata();
    const w = meta.width ?? 1200;
    const h = meta.height ?? 900;
    const cw = Math.floor(w * 0.55);
    const ch = Math.floor(h * 0.55);
    bytes = await sharp(bytes)
      .extract({
        left: Math.floor((w - cw) * (0.25 + rng() * 0.5)),
        top: Math.floor((h - ch) * (0.25 + rng() * 0.5)),
        width: cw,
        height: ch,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
  }

  if (opts.amateur) bytes = await degradeToPhoneCamera(bytes, rng);

  return ingestor(bytes, "image/jpeg");
}

// ---------------------------------------------------------------------------
// seeding
// ---------------------------------------------------------------------------

async function seedSeller(spec: SellerSpec, today: Date) {
  const id = sellerId(spec.slug);
  // Per-entity stream — see `rngFor`. Never take a shared one here.
  const rng = rngFor(`seller:${spec.slug}`);
  const existing = await prisma.foodSeller.findUnique({
    where: { id },
    select: { id: true, profileImageThumb: true },
  });

  // Content fields update on re-run; identity/timestamps do not.
  const content = {
    slug: spec.slug,
    displayName: spec.displayName,
    bio: spec.bio,
    areas: spec.areas,
    languages: spec.languages,
    specialties: spec.specialties,
    status: spec.status,
    fulfillmentModes: spec.fulfillmentModes,
  } satisfies Partial<Prisma.FoodSellerUncheckedCreateInput>;

  await prisma.foodSeller.upsert({
    where: { id },
    update: content,
    create: {
      id,
      // `userId` is an opaque identity-store id with no cross-DB relation
      // (Part D). The seed mints its own and NEVER touches the identity DB.
      userId: `${id}-user`,
      ...content,
      createdAt: daysAgo(intBetween(rng, 60, 400)),
    },
  });

  // Photos on CREATE only — see the header.
  if (!existing?.profileImageThumb) {
    const avatarTerms = spec.listings[0]?.photoTerms ?? ["food"];
    const [avatar, cover] = await Promise.all([
      ingestPhoto(`${id}-avatar`, avatarTerms, ingestSellerAvatar, rng, { amateur: true }),
      ingestPhoto(`${id}-cover`, spec.listings[0]?.photoTerms ?? ["food"], ingestSellerCover, rng),
    ]);

    await prisma.foodSeller.update({
      where: { id },
      data: {
        profileImageThumb: avatar.pathThumb,
        profileImageCard: avatar.pathCard,
        profileImageFull: avatar.pathFull,
        profileImageBlur: avatar.blurDataUrl,
        coverImageThumb: cover.pathThumb,
        coverImageCard: cover.pathCard,
        coverImageFull: cover.pathFull,
        coverImageBlur: cover.blurDataUrl,
      },
    });
  }

  // Gallery — Part F1's seller profile has one, and Slice 11 renders it.
  const galleryCount = await prisma.foodSellerPhoto.count({ where: { sellerId: id } });
  if (galleryCount === 0 && spec.status === "ACTIVE") {
    for (const [index, listing] of spec.listings.slice(0, 2).entries()) {
      const paths = await ingestPhoto(
        `${id}-gallery-${index}`,
        listing.photoTerms,
        ingestSellerGalleryPhoto,
        rng,
        { amateur: index % 2 === 1 },
      );
      await prisma.foodSellerPhoto.create({
        data: {
          id: `${id}-gallery-${index}`,
          sellerId: id,
          ...paths,
          sortOrder: index,
          createdAt: daysAgo(intBetween(rng, 5, 90)),
        },
      });
    }
  }

  return id;
}

async function seedListing(
  spec: ListingSpec,
  ownerId: string,
  categoryIds: Map<string, string>,
  today: Date,
) {
  const id = listingId(spec.slug);
  const rng = rngFor(`listing:${spec.slug}`);
  const existing = await prisma.foodListing.findUnique({
    where: { id },
    select: { id: true, _count: { select: { photos: true } } },
  });

  const content = {
    slug: spec.slug,
    title: spec.title,
    description: spec.description,
    kind: spec.kind,
    priceMode: spec.priceMode,
    // ⚠ Integer cents (Part D). The DB enforces NULL iff QUOTE.
    priceCents: spec.priceTtd === null ? null : Math.round(spec.priceTtd * 100),
    feedsCount: spec.feedsCount ?? null,
    dietaryTags: spec.dietaryTags ?? [],
    ingredientTags: spec.ingredientTags,
    occasionTag: spec.occasionTag ?? null,
    active: spec.active ?? true,
  } satisfies Partial<Prisma.FoodListingUncheckedCreateInput>;

  await prisma.foodListing.upsert({
    where: { id },
    update: content,
    create: {
      id,
      sellerId: ownerId,
      ...content,
      createdAt: daysAgo(intBetween(rng, 1, 120)),
    },
  });

  // Categories — replaced wholesale so an edit to the catalogue takes effect.
  await prisma.foodListingCategory.deleteMany({ where: { listingId: id } });
  for (const slug of spec.categories) {
    const categoryId = categoryIds.get(slug);
    if (!categoryId) throw new Error(`Category "${slug}" is not in the taxonomy — run npm run db:seed first`);
    await prisma.foodListingCategory.create({ data: { listingId: id, categoryId } });
  }

  // Availability windows — likewise replaced, since they are pure content.
  await prisma.foodAvailabilityWindow.deleteMany({ where: { listingId: id } });
  for (const [index, windowSpec] of spec.windows.entries()) {
    await prisma.foodAvailabilityWindow.create({
      data: { id: `${id}-window-${index}`, listingId: id, ...windowData(windowSpec, today) },
    });
  }

  // Photos on CREATE only.
  if ((existing?._count.photos ?? 0) === 0) {
    // Roughly half the catalogue goes through a worse camera — see
    // `degradeToPhoneCamera`'s header for why this is load-bearing rather than
    // decorative.
    const amateur = spec.amateurPhoto ?? rng() < 0.45;
    const wantsSecond = rng() < 0.4;

    const photos: PhotoVariantPaths[] = [
      await ingestPhoto(id, spec.photoTerms, ingestMealPhoto, rng, { amateur }),
    ];
    if (wantsSecond) {
      photos.push(
        await ingestPhoto(id, spec.photoTerms, ingestMealPhoto, rng, { amateur, crop: true }),
      );
    }

    for (const [index, paths] of photos.entries()) {
      await prisma.foodListingPhoto.create({
        data: {
          id: `${id}-photo-${index}`,
          listingId: id,
          ...paths,
          sortOrder: index, // 0 is the hero (Part D)
          createdAt: daysAgo(intBetween(rng, 1, 100)),
        },
      });
    }
  }

  return id;
}

async function seedFreshToday(spec: SellerSpec, ownerId: string) {
  if (!spec.freshToday?.length) return;
  const rng = rngFor(`fresh:${spec.slug}`);

  const highlightIds = new Map<string, string>();
  for (const [index, title] of (spec.highlights ?? []).entries()) {
    const id = `${ownerId}-highlight-${index}`;
    highlightIds.set(title, id);
    await prisma.foodStoryHighlight.upsert({
      where: { id },
      update: { title, sortOrder: index },
      create: { id, sellerId: ownerId, title, sortOrder: index },
    });
  }

  const highlightList = [...highlightIds.values()];

  for (const [index, entry] of spec.freshToday.entries()) {
    const id = `${ownerId}-story-${index}`;
    const existing = await prisma.foodStory.findUnique({ where: { id }, select: { id: true } });
    if (existing) {
      await prisma.foodStory.update({ where: { id }, data: { caption: entry.caption } });
      continue;
    }

    const paths = await ingestPhoto(id, entry.terms, ingestStoryPhoto, rng, {
      amateur: rng() < 0.6,
    });

    await prisma.foodStory.create({
      data: {
        id,
        sellerId: ownerId,
        ...paths,
        caption: entry.caption,
        linkedListingId: entry.linkTo ? listingId(entry.linkTo) : null,
        // ⚠ Far-future expiry on purpose: Slice 11 needs these to still be live
        // whenever it is built, and Slice 15 rewrites them to realistic recent
        // timestamps once the posting tools and the sweep exist.
        expiresAt: STORY_EXPIRY,
        createdAt: daysAgo(intBetween(rng, 0, 3), intBetween(rng, 6, 18)),
        // A third of entries land on the Menu shelf, which is what makes the
        // shelf non-empty for Slice 11 without every post being kept forever.
        highlightId: highlightList.length > 0 && index % 3 === 0 ? highlightList[index % highlightList.length] : null,
      },
    });
  }

  await prisma.foodSeller.update({
    where: { id: ownerId },
    data: { lastStoryAt: daysAgo(0, 8) },
  });
}

/**
 * Category hero imagery.
 *
 * ⚠ Written to `FoodCategory.heroImage`, which is **taxonomy, not seed data** —
 * so unlike everything else in this file these rows are NOT `seed-` prefixed and
 * `db:seed:demo:clear` deliberately does not remove them. The column is left as
 * a plain storage key rather than a variant set because Part D declares it a
 * single `heroImage`, and a category hero is decorative chrome rather than
 * user-uploaded content.
 *
 * Added after looking at the rendered home page: Part E1 section 3 asks for
 * "category cards with hero imagery", and the cards were shipping as flat tinted
 * blocks because nothing had ever populated the column.
 */
async function seedCategoryHeroes() {
  const categories = await prisma.foodCategory.findMany({
    where: { heroImage: null },
    select: { id: true, slug: true },
  });

  for (const category of categories) {
    const rng = rngFor(`category:${category.slug}`);
    // Reuse the dish vocabulary a category actually contains, so the hero looks
    // like the category rather than like generic food.
    const terms = CATEGORY_PHOTO_TERMS[category.slug] ?? [category.slug.replace(/-/g, " ")];
    const paths = await ingestCategoryHero(
      (await fetchSeedPhoto({ ref: `category-${category.slug}`, terms }, rng)).buffer,
      "image/jpeg",
    );
    await prisma.foodCategory.update({
      where: { id: category.id },
      data: { heroImage: paths.pathCard },
    });
  }
}

const CATEGORY_PHOTO_TERMS: Record<string, string[]> = {
  breakfast: ["breakfast", "toast"],
  lunch: ["chicken", "rice"],
  dinner: ["beef", "stew"],
  snacks: ["fritter", "pastry"],
  desserts: ["dessert", "cake"],
  "baked-goods": ["bread", "pastry"],
  "bbq-grill": ["barbecue", "ribs"],
  drinks: ["drink", "punch"],
  "juices-smoothies": ["smoothie", "juice"],
  "vegetarian-vegan": ["vegetarian", "vegan"],
  catering: ["platter", "buffet"],
  "holiday-specials": ["christmas cake", "fruit cake"],
};

/**
 * Follows and saves.
 *
 * Neither is in Slice 8's brief, and both are here deliberately: a profile
 * reading "0 followers" and a marketplace where nothing was ever saved makes the
 * demo look abandoned, which is the one thing a curated seed exists to prevent.
 * Real rows are written and `followerCount` is **recounted from the table**
 * rather than trusted from the catalogue, so Slice 11 starts from a counter that
 * agrees with its own data.
 */
async function seedEngagement() {
  const sellers = await prisma.foodSeller.findMany({
    where: { id: { startsWith: "seed-seller-" } },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(sellers.map((s) => [s.slug, s.id]));

  for (const spec of SELLERS) {
    const id = bySlug.get(spec.slug);
    if (!id) continue;

    const followRng = rngFor(`follows:${spec.slug}`);
    for (let i = 0; i < spec.followers; i += 1) {
      const userId = demoUserId(i);
      await prisma.foodFollow.upsert({
        where: { userId_sellerId: { userId, sellerId: id } },
        update: {},
        // ⚠ The id is derived from the PAIR, never from a loop index. An
        // index-derived id is stable only while the iteration order is, and
        // that assumption is what produced a P2002 on a re-run.
        create: {
          id: `${id}-follow-${userId}`,
          userId,
          sellerId: id,
          createdAt: daysAgo(intBetween(followRng, 1, 200)),
        },
      });
    }

    const count = await prisma.foodFollow.count({ where: { sellerId: id } });
    await prisma.foodSeller.update({ where: { id }, data: { followerCount: count } });
  }

  // Saves — a plausible scatter, so `/saved` and "popular in your area" have
  // something real to read rather than a hand-set popularity number.
  const listings = await prisma.foodListing.findMany({
    where: { id: { startsWith: "seed-listing-" }, active: true },
    select: { id: true },
  });
  for (const listing of listings) {
    // Derived from the listing's own identity, so the scatter does not depend
    // on the order this loop happens to run in.
    const saveRng = rngFor(`saves:${listing.id}`);
    const savers = intBetween(saveRng, 0, 14);
    for (let i = 0; i < savers; i += 1) {
      const userId = demoUserId(intBetween(saveRng, 0, 119));
      await prisma.foodSave.upsert({
        where: { userId_listingId: { userId, listingId: listing.id } },
        update: {},
        // Pair-derived id — see the follow rows above for why.
        create: {
          id: `${listing.id}-save-${userId}`,
          userId,
          listingId: listing.id,
          createdAt: daysAgo(intBetween(saveRng, 1, 90)),
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------

async function clear() {
  console.log("Removing demo seed data (every row with a `seed-` id)…");
  // Order matters only where a relation is Restrict rather than Cascade; the
  // seed writes no orders, so listings and sellers cascade their own children.
  const results = {
    saves: await prisma.foodSave.deleteMany({ where: { id: { startsWith: "seed-" } } }),
    follows: await prisma.foodFollow.deleteMany({ where: { id: { startsWith: "seed-" } } }),
    stories: await prisma.foodStory.deleteMany({ where: { id: { startsWith: "seed-" } } }),
    highlights: await prisma.foodStoryHighlight.deleteMany({ where: { id: { startsWith: "seed-" } } }),
    listings: await prisma.foodListing.deleteMany({ where: { id: { startsWith: "seed-" } } }),
    sellers: await prisma.foodSeller.deleteMany({ where: { id: { startsWith: "seed-" } } }),
  };
  for (const [name, result] of Object.entries(results)) {
    console.log(`  ${name.padEnd(12)} ${result.count}`);
  }
  console.log("✔ Demo seed removed. The category taxonomy is untouched.");
}

async function seed() {
  const source = activePhotoSource();
  const today = new Date();

  console.log(`Seeding the demo marketplace — photo source: ${source}`);
  if (source === "mealdb") {
    console.log(
      "  ⚠ TheMealDB is a development/demo image source, not a licence to publish these as real sellers' photos.",
    );
  }

  const categories = await prisma.foodCategory.findMany({ select: { id: true, slug: true } });
  if (categories.length === 0) {
    throw new Error("No categories found — run `npm run db:seed` (the taxonomy) first.");
  }
  const categoryIds = new Map(categories.map((c) => [c.slug, c.id]));

  for (const spec of SELLERS) {
    const ownerId = await seedSeller(spec, today);
    for (const listing of spec.listings) {
      await seedListing(listing, ownerId, categoryIds, today);
    }
    await seedFreshToday(spec, ownerId);
    console.log(`  ✔ ${spec.displayName.padEnd(28)} ${spec.listings.length} listings`);
  }

  await seedCategoryHeroes();
  await seedEngagement();

  const counts = {
    sellers: await prisma.foodSeller.count({ where: { id: { startsWith: "seed-" } } }),
    listings: await prisma.foodListing.count({ where: { id: { startsWith: "seed-" } } }),
    photos: await prisma.foodListingPhoto.count({ where: { id: { startsWith: "seed-" } } }),
    windows: await prisma.foodAvailabilityWindow.count({ where: { id: { startsWith: "seed-" } } }),
    stories: await prisma.foodStory.count({ where: { id: { startsWith: "seed-" } } }),
    follows: await prisma.foodFollow.count({ where: { id: { startsWith: "seed-" } } }),
    saves: await prisma.foodSave.count({ where: { id: { startsWith: "seed-" } } }),
  };

  console.log("\nSeeded:");
  for (const [name, value] of Object.entries(counts)) console.log(`  ${name.padEnd(10)} ${value}`);
  console.log(
    `\nPhotos ingested this run — ${Object.entries(tally)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}: ${n}`)
      .join(", ") || "none (all already present)"}`,
  );
  if (tally.synthetic > 0 && source !== "synthetic") {
    console.log(
      `  ⚠ ${tally.synthetic} photo(s) fell back to synthetic — the chosen source failed for those refs.`,
    );
  }
}

async function main() {
  if (process.argv.includes("--clear")) await clear();
  else await seed();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
