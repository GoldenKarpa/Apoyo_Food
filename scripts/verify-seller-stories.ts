/**
 * Slice 15 verification — the seller-side Fresh Today domain, against the
 * real database. Complements `scripts/verify-sweep.ts` (the expiry job
 * itself) by covering everything else: ownership scoping, the read queries
 * `/food/stories` renders, and the basic dashboard's three counts.
 *
 * `createStory`/`deleteStory`/the highlight actions aren't exercised here for
 * the now-familiar reason (Slices 10/11/13/14 all hit it): they call
 * `next/headers` via `getFoodSession()`, which throws outside a real request
 * scope. Those are proven live in `verify-story-posting.mjs` instead.
 *
 *   npx tsx scripts/verify-seller-stories.ts
 */
import { PrismaClient } from "@prisma/client";

import { expiresAtFrom, STORY_LIFETIME_HOURS } from "../lib/story-form";
import { activeStoriesForSeller, highlightsForSeller, sellerDashboardStats } from "../lib/seller-stories";

const prisma = new PrismaClient();

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

const PREFIX = "_verify-s15-domain";

async function cleanup() {
  await prisma.foodSave.deleteMany({ where: { listing: { seller: { userId: { startsWith: PREFIX } } } } });
  await prisma.foodDemandEvent.deleteMany({ where: { sellerId: { in: await sellerIds() } } });
  await prisma.foodStoryView.deleteMany({ where: { story: { seller: { userId: { startsWith: PREFIX } } } } });
  await prisma.foodStory.deleteMany({ where: { seller: { userId: { startsWith: PREFIX } } } });
  await prisma.foodStoryHighlight.deleteMany({ where: { seller: { userId: { startsWith: PREFIX } } } });
  await prisma.foodListing.deleteMany({ where: { seller: { userId: { startsWith: PREFIX } } } });
  await prisma.foodSeller.deleteMany({ where: { userId: { startsWith: PREFIX } } });
}

async function sellerIds(): Promise<string[]> {
  const rows = await prisma.foodSeller.findMany({
    where: { userId: { startsWith: PREFIX } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function fakePaths(id: string) {
  return {
    pathThumb: `stories/${id}-thumb.webp`,
    pathCard: `stories/${id}-card.webp`,
    pathFull: `stories/${id}-full.webp`,
    blurDataUrl: "data:image/jpeg;base64,x",
  };
}

async function main() {
  await cleanup();

  section("expiresAtFrom — the one place the 24h lifetime is computed");
  const created = new Date("2026-08-01T12:00:00Z");
  assert(
    "adds exactly STORY_LIFETIME_HOURS",
    expiresAtFrom(created).getTime() === created.getTime() + STORY_LIFETIME_HOURS * 60 * 60 * 1000,
  );
  assert("STORY_LIFETIME_HOURS is 24, matching Part E2", STORY_LIFETIME_HOURS === 24);

  const owner = await prisma.foodSeller.create({
    data: { userId: `${PREFIX}-owner`, slug: `${PREFIX}-owner`, displayName: "x", status: "ACTIVE" },
  });
  const intruder = await prisma.foodSeller.create({
    data: { userId: `${PREFIX}-intruder`, slug: `${PREFIX}-intruder`, displayName: "y", status: "ACTIVE" },
  });

  section("Ownership scoping — story and highlight, both compound-where");
  const highlight = await prisma.foodStoryHighlight.create({ data: { sellerId: owner.id, title: "Shelf" } });
  const story = await prisma.foodStory.create({
    data: { sellerId: owner.id, ...fakePaths("s1"), createdAt: new Date(), expiresAt: expiresAtFrom(new Date()) },
  });

  // `requireOwnStory`/`requireOwnHighlight` resolve via the SESSION in
  // production (`requireOwnSeller()` -> `getFoodSession()` -> `next/headers`),
  // which throws outside a real request scope — the same limitation every
  // ownership-check script since Slice 10 has hit. So the ownership SHAPE is
  // proven directly here instead, running the identical compound-where query
  // both functions run internally once a seller is resolved. The live
  // request-scoped path is proven in `verify-story-posting.mjs`.
  const storyAsOwner = await prisma.foodStory.findFirst({ where: { id: story.id, sellerId: owner.id } });
  assert("the owning seller's compound-where resolves the story", storyAsOwner?.id === story.id);

  const highlightAsOwner = await prisma.foodStoryHighlight.findFirst({
    where: { id: highlight.id, sellerId: owner.id },
  });
  assert("the owning seller's compound-where resolves the highlight", highlightAsOwner?.id === highlight.id);

  const storyAsIntruder = await prisma.foodStory.findFirst({ where: { id: story.id, sellerId: intruder.id } });
  assert("a DIFFERENT seller's compound-where resolves nothing for the same story", storyAsIntruder === null);
  const highlightAsIntruder = await prisma.foodStoryHighlight.findFirst({
    where: { id: highlight.id, sellerId: intruder.id },
  });
  assert("…and the same for a highlight", highlightAsIntruder === null);

  section("activeStoriesForSeller — non-expired only, with a real view count");
  const now = new Date();
  const expiredStory = await prisma.foodStory.create({
    data: {
      sellerId: owner.id,
      ...fakePaths("s2"),
      createdAt: new Date(now.getTime() - 30 * 3_600_000),
      expiresAt: new Date(now.getTime() - 6 * 3_600_000), // already expired
    },
  });
  await prisma.foodStoryView.createMany({
    data: [
      { storyId: story.id, userId: `${PREFIX}-viewer-1` },
      { storyId: story.id, userId: `${PREFIX}-viewer-2` },
    ],
  });

  const active = await activeStoriesForSeller(owner.id, now);
  assert("the expired story is EXCLUDED from 'active now'", !active.some((s) => s.id === expiredStory.id));
  assert("the active story IS included", active.some((s) => s.id === story.id));
  const activeRow = active.find((s) => s.id === story.id);
  assert("…with its real view count (2 FoodStoryView rows)", activeRow?._count.views === 2, activeRow?._count.views);

  section("highlightsForSeller — shows stories regardless of expiresAt");
  await prisma.foodStory.update({ where: { id: expiredStory.id }, data: { highlightId: highlight.id } });
  const highlights = await highlightsForSeller(owner.id);
  const shelf = highlights.find((h) => h.id === highlight.id);
  assert(
    "an EXPIRED story still appears on its highlight's own story list",
    !!shelf?.stories.some((s) => s.id === expiredStory.id),
    shelf,
  );

  section("sellerDashboardStats — views/saves/follows, the basic dashboard's entire surface");
  const listing = await prisma.foodListing.create({
    data: {
      sellerId: owner.id,
      slug: `${PREFIX}-listing`,
      title: "x",
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "QUOTE",
    },
  });
  await prisma.foodDemandEvent.createMany({
    data: [
      { kind: "PROFILE_VIEW", sellerId: owner.id },
      { kind: "LISTING_VIEW", sellerId: owner.id, listingId: listing.id },
      { kind: "LISTING_VIEW", sellerId: owner.id, listingId: listing.id },
      // A search event carrying this seller nowhere — must NOT be counted as a view.
      { kind: "SEARCH", queryNormalized: "x", resultCount: 0 },
    ],
  });
  await prisma.foodSave.create({ data: { userId: `${PREFIX}-saver`, listingId: listing.id } });
  // ⚠ Re-fetched, not reused — `owner` is the object from the CREATE call
  // above and Prisma's `update()` does not mutate it in place. Passing the
  // stale local would silently prove nothing about whether `followerCount` is
  // actually read from the row.
  const refreshedOwner = await prisma.foodSeller.update({
    where: { id: owner.id },
    data: { followerCount: 7 },
  });

  const stats = await sellerDashboardStats(refreshedOwner);
  assert("views = PROFILE_VIEW + LISTING_VIEW for this seller (3), never SEARCH", stats.views === 3, stats.views);
  assert("saves = FoodSave rows reached through this seller's own listings (1)", stats.saves === 1, stats.saves);
  assert("follows reads the denormalized followerCount directly (7)", stats.follows === 7, stats.follows);

  await cleanup();
  const leftover = await prisma.foodSeller.count({ where: { userId: { startsWith: PREFIX } } });
  assert("self-cleaning: no verification rows survive the run", leftover === 0);

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
