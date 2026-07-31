/**
 * Slice 11 verification — follows, the Fresh Today viewer's queries, and the
 * FOLLOW/STORY_VIEW demand events, exercised against the real seeded
 * database.
 *
 *   npm run verify:follows
 *
 * `toggleFollowSeller` and `recordStoryView` (the Server Actions) are NOT
 * exercised here — both call `next/headers`' `headers()` via `getFoodSession()`,
 * which throws outside a real request scope, the same limitation Slice 10's
 * `verify-saves.ts` documents for `toggleSaveListing`. Their core logic
 * (the transactional recount, the view upsert) is replicated inline against
 * Prisma directly; the actions themselves are proven live instead (see this
 * slice's Implementation notes).
 */

import { PrismaClient } from "@prisma/client";

import { followedSellerIds, isSellerFollowed } from "../lib/follows";
import { followedSellersListings, freshTodayEntries } from "../lib/discovery";
import { recordDemandEvent } from "../lib/demand";
import { sellerActiveStories, seenStoryIds, sellerStoryQueue } from "../lib/stories";

const prisma = new PrismaClient();

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

const HIDDEN_SELLERS = ["mama-lin-kitchen", "pastelitos-y-mas"];

/** Mirrors `toggleFollowSeller`'s transaction — see the header comment. */
async function toggleFollow(userId: string, sellerId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.foodFollow.findUnique({
      where: { userId_sellerId: { userId, sellerId } },
    });
    if (existing) {
      await tx.foodFollow.delete({ where: { id: existing.id } });
    } else {
      await tx.foodFollow.create({ data: { userId, sellerId } });
    }
    const followerCount = await tx.foodFollow.count({ where: { sellerId } });
    await tx.foodSeller.update({ where: { id: sellerId }, data: { followerCount } });
    return { following: !existing, followerCount };
  });
}

async function run() {
  // ──────────────────────────────────────────────────────────────────────
  section("FoodFollow model — constraint, transactional recount, cascade");

  const seller = await prisma.foodSeller.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true, followerCount: true },
  });
  if (!seller) throw new Error("no ACTIVE seller in the seed");
  const userId = `verify-follows-${Date.now()}`;
  await prisma.foodFollow.deleteMany({ where: { userId } });

  const originalCount = await prisma.foodFollow.count({ where: { sellerId: seller.id } });

  const created = await prisma.foodFollow.create({ data: { userId, sellerId: seller.id } });
  check(!!created.id, "a follow is created");

  let duplicateRejected = false;
  try {
    await prisma.foodFollow.create({ data: { userId, sellerId: seller.id } });
  } catch (err) {
    duplicateRejected = (err as { code?: string }).code === "P2002";
  }
  check(duplicateRejected, "a duplicate (userId, sellerId) follow is rejected with P2002");

  await prisma.foodFollow.delete({ where: { id: created.id } });

  // The transactional recount, proven with real churn — not a blind
  // increment/decrement, which would drift under exactly this kind of
  // repeated toggle.
  const t1 = await toggleFollow(userId, seller.id); // follow
  const t2 = await toggleFollow(userId, seller.id); // unfollow
  const t3 = await toggleFollow(userId, seller.id); // follow again
  check(t1.following && t1.followerCount === originalCount + 1, "toggle 1 (follow): count is original+1", String(t1.followerCount));
  check(!t2.following && t2.followerCount === originalCount, "toggle 2 (unfollow): count returns to original", String(t2.followerCount));
  check(t3.following && t3.followerCount === originalCount + 1, "toggle 3 (follow again): count is original+1, no drift", String(t3.followerCount));

  const dbSellerAfter = await prisma.foodSeller.findUniqueOrThrow({ where: { id: seller.id } });
  check(
    dbSellerAfter.followerCount === originalCount + 1,
    "FoodSeller.followerCount on disk matches the real FoodFollow count",
    `${dbSellerAfter.followerCount} vs expected ${originalCount + 1}`,
  );

  // Cascade: a THROWAWAY seller, never a real seeded one.
  const throwawaySeller = await prisma.foodSeller.create({
    data: {
      userId: `verify-follows-seller-${Date.now()}`,
      slug: `_verify-follows-seller-${Date.now()}`,
      displayName: "Verify Follows Seller",
      status: "ACTIVE",
    },
  });
  await prisma.foodFollow.create({ data: { userId, sellerId: throwawaySeller.id } });
  await prisma.foodSeller.delete({ where: { id: throwawaySeller.id } });
  const orphanedFollow = await prisma.foodFollow.findUnique({
    where: { userId_sellerId: { userId, sellerId: throwawaySeller.id } },
  });
  check(orphanedFollow === null, "deleting a seller cascades to its follows (Slice 2's design)");

  // ──────────────────────────────────────────────────────────────────────
  section("lib/follows.ts — the read side");

  check(await isSellerFollowed(userId, seller.id), "isSellerFollowed: true for the real follow above");
  check(!(await isSellerFollowed(userId, "nonexistent-seller-id")), "isSellerFollowed: false for a nonexistent seller");
  check(!(await isSellerFollowed(null, seller.id)), "isSellerFollowed: false for a null (anonymous) userId");

  const followedIds = await followedSellerIds(userId);
  check(followedIds.has(seller.id) && followedIds.size === 1, "followedSellerIds: exactly the followed seller");
  check((await followedSellerIds(null)).size === 0, "followedSellerIds: anonymous viewer gets an empty set");

  // ──────────────────────────────────────────────────────────────────────
  section('"From sellers you follow" (Part E1 section 7)');

  const following = await followedSellersListings(userId, 50);
  check(following.length > 0, `followedSellersListings returns the followed seller's listings (${following.length})`);
  check(
    following.every((l) => l.seller.slug !== undefined),
    "…every row carries seller info",
  );
  const followedListingSellers = new Set(following.map((l) => l.seller.slug));
  check(!followedListingSellers.has("nonexistent"), "sanity: no phantom seller slugs");

  const nobodyFollowed = await followedSellersListings(`verify-follows-nobody-${Date.now()}`, 50);
  check(nobodyFollowed.length === 0, "…and a user following nobody gets nothing back");

  // ──────────────────────────────────────────────────────────────────────
  section("Fresh Today rail — followed-first, unseen-first re-ordering (Part E1)");

  const anonymousOrder = await freshTodayEntries(50, null);
  const followedOrder = await freshTodayEntries(50, userId);
  check(anonymousOrder.length === followedOrder.length, "re-ordering doesn't drop or add entries");

  const followedIndex = followedOrder.findIndex((e) => e.seller.id === seller.id);
  check(followedIndex !== -1, "the followed seller's entry exists in the re-ordered rail");
  const anyEarlierIsAlsoFollowed = followedOrder
    .slice(0, followedIndex)
    .every((e) => e.seller.id === seller.id);
  check(
    followedIndex === 0 || anyEarlierIsAlsoFollowed,
    "…and nothing NOT-followed is ranked ahead of it",
    `followed entry at index ${followedIndex}`,
  );

  // ──────────────────────────────────────────────────────────────────────
  section("lib/stories.ts — the viewer's queue and per-seller reads");

  const queue = await sellerStoryQueue(new Date(), null);
  check(queue.length > 0, `sellerStoryQueue is non-empty (${queue.length})`);
  check(
    !queue.some((q) => HIDDEN_SELLERS.includes(q.slug)),
    "⚠ the visibility rule holds here too — no suspended/pending seller in the queue",
  );

  const queueWithFollow = await sellerStoryQueue(new Date(), userId);
  const followedQueueIndex = queueWithFollow.findIndex((q) => q.id === seller.id);
  check(
    followedQueueIndex <= 0 || queueWithFollow.slice(0, followedQueueIndex).every((q) => q.id === seller.id),
    "the story queue is ALSO followed-first, matching the rail's own ordering",
  );

  const anySellerWithStory = queue[0];
  const { seller: fetchedSeller, stories } = await sellerActiveStories(anySellerWithStory.slug, new Date());
  check(fetchedSeller?.slug === anySellerWithStory.slug, "sellerActiveStories resolves the right seller");
  check(stories.length > 0, `…and returns their active stories (${stories.length})`);
  check(
    stories.every((s, i) => i === 0 || stories[i - 1].createdAt <= s.createdAt),
    "…ordered chronologically (oldest first) — the viewer's own slide order",
  );

  const missing = await sellerActiveStories("nonexistent-seller-slug-xyz", new Date());
  check(missing.seller === null && missing.stories.length === 0, "a nonexistent seller resolves to nothing, not a throw");

  const suspendedQueueEntry = await sellerActiveStories(HIDDEN_SELLERS[0], new Date());
  check(
    suspendedQueueEntry.seller === null,
    "⚠ sellerActiveStories refuses the SUSPENDED seller's slug — the viewer route 404s, not renders",
  );

  // seenStoryIds
  const storyIds = stories.map((s) => s.id);
  const noneSeenYet = await seenStoryIds(userId, storyIds);
  check(noneSeenYet.size === 0, "seenStoryIds: nothing seen yet for a fresh synthetic user");
  await prisma.foodStoryView.upsert({
    where: { storyId_userId: { storyId: storyIds[0], userId } },
    create: { storyId: storyIds[0], userId },
    update: {},
  });
  const oneSeen = await seenStoryIds(userId, storyIds);
  check(oneSeen.size === 1 && oneSeen.has(storyIds[0]), "seenStoryIds: reflects a real FoodStoryView row");
  check((await seenStoryIds(null, storyIds)).size === 0, "seenStoryIds: anonymous viewer short-circuits to empty");

  // Duplicate view upsert doesn't throw and doesn't create a second row.
  await prisma.foodStoryView.upsert({
    where: { storyId_userId: { storyId: storyIds[0], userId } },
    create: { storyId: storyIds[0], userId },
    update: {},
  });
  const viewRows = await prisma.foodStoryView.count({ where: { storyId: storyIds[0], userId } });
  check(viewRows === 1, "a repeated view upserts, never duplicates (no P2002 surfaced to the caller)");

  await prisma.foodStoryView.deleteMany({ where: { userId } });

  // ──────────────────────────────────────────────────────────────────────
  section("FOLLOW / STORY_VIEW demand events (Part E4/E7)");

  await recordDemandEvent({ kind: "FOLLOW", sellerId: seller.id, userId });
  const followEvent = await prisma.foodDemandEvent.findFirst({
    where: { kind: "FOLLOW", sellerId: seller.id },
    orderBy: { createdAt: "desc" },
  });
  check(followEvent !== null, "a FOLLOW event is written");
  check(!!followEvent?.userIdHash && followEvent.userIdHash.length === 32, "…hashed, same as every other demand event");

  await recordDemandEvent({ kind: "STORY_VIEW", sellerId: seller.id, userId: null });
  const anonStoryView = await prisma.foodDemandEvent.findFirst({
    where: { kind: "STORY_VIEW", sellerId: seller.id, userIdHash: null },
    orderBy: { createdAt: "desc" },
  });
  check(anonStoryView !== null, "⚠ STORY_VIEW fires for an anonymous viewer too (unlike FoodStoryView itself)");

  await prisma.foodDemandEvent.deleteMany({ where: { kind: { in: ["FOLLOW", "STORY_VIEW"] }, sellerId: seller.id } });

  // ⚠ Final cleanup — RECOUNTS `followerCount` after deleting the leftover
  // row, exactly like `toggleFollowSeller` itself does. A plain `deleteMany`
  // here left the seed's real seller `followerCount` permanently off by one
  // on disk after every run — caught by `verify-seed.ts`'s own cross-check,
  // not by this script (which has no assertion on the seller's counter after
  // this point to catch its own drift). Do not revert to a bare deleteMany.
  await prisma.foodFollow.deleteMany({ where: { userId } });
  const finalCount = await prisma.foodFollow.count({ where: { sellerId: seller.id } });
  await prisma.foodSeller.update({ where: { id: seller.id }, data: { followerCount: finalCount } });

  console.log(`\n${passes} pass, ${failures.length} fail`);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
