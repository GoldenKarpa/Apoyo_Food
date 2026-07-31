/**
 * Slice 10 verification — saves, "more from this seller"/"similar in
 * category" recs, and the SAVE demand event, exercised against the real
 * seeded database.
 *
 *   npm run verify:saves
 *
 * `toggleSaveListing` (the Server Action) is NOT exercised here — it calls
 * `next/headers`' `headers()` internally via `getFoodSession()`, which throws
 * outside a real request scope, so a plain tsx script cannot call it directly.
 * That path is proven live instead, over real HTTP with a minted session (see
 * this slice's Implementation notes). This script covers everything that
 * doesn't need a request: the `FoodSave` model itself, and the read-side
 * functions (`lib/saves.ts`, `lib/discovery.ts`'s new rec queries).
 */

import { PrismaClient } from "@prisma/client";

import { moreFromSeller, similarInCategory } from "../lib/discovery";
import { isListingSaved, savedListingIds } from "../lib/saves";
import { recordDemandEvent } from "../lib/demand";

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

async function run() {
  // ──────────────────────────────────────────────────────────────────────
  section("FoodSave model — constraint, idempotency, cascade");

  const buyer = await prisma.foodListing.findFirst({
    where: { active: true, seller: { status: "ACTIVE" } },
    select: { id: true, sellerId: true },
  });
  if (!buyer) throw new Error("no ACTIVE listing in the seed to test against");
  const userId = `verify-saves-${Date.now()}`;

  // Clean slate for this synthetic user (idempotent re-run).
  await prisma.foodSave.deleteMany({ where: { userId } });

  const created = await prisma.foodSave.create({ data: { userId, listingId: buyer.id } });
  check(!!created.id, "a save is created");

  let duplicateRejected = false;
  try {
    await prisma.foodSave.create({ data: { userId, listingId: buyer.id } });
  } catch (err) {
    duplicateRejected = (err as { code?: string }).code === "P2002";
  }
  check(duplicateRejected, "a duplicate (userId, listingId) save is rejected with P2002");

  await prisma.foodSave.delete({ where: { id: created.id } });
  const afterUnsave = await prisma.foodSave.findUnique({
    where: { userId_listingId: { userId, listingId: buyer.id } },
  });
  check(afterUnsave === null, "un-save removes exactly the one row");

  const resaved = await prisma.foodSave.create({ data: { userId, listingId: buyer.id } });
  check(!!resaved.id, "saving again after un-saving succeeds — no lingering conflict");

  // Cascade: on a THROWAWAY seller/listing, never a real seeded one.
  const throwawaySeller = await prisma.foodSeller.create({
    data: {
      userId: `verify-saves-seller-${Date.now()}`,
      slug: `_verify-saves-seller-${Date.now()}`,
      displayName: "Verify Saves Seller",
      status: "ACTIVE",
    },
  });
  const throwawayListing = await prisma.foodListing.create({
    data: {
      sellerId: throwawaySeller.id,
      slug: `_verify-saves-listing-${Date.now()}`,
      title: "Verify Saves Listing",
      description: "throwaway",
      kind: "SINGLE_ITEM",
      priceMode: "FIXED",
      priceCents: 100,
    },
  });
  await prisma.foodSave.create({ data: { userId, listingId: throwawayListing.id } });
  await prisma.foodListing.delete({ where: { id: throwawayListing.id } });
  const orphanedSave = await prisma.foodSave.findUnique({
    where: { userId_listingId: { userId, listingId: throwawayListing.id } },
  });
  check(orphanedSave === null, "deleting a listing cascades to its saves (Slice 2's design)");
  await prisma.foodSeller.delete({ where: { id: throwawaySeller.id } });

  // ──────────────────────────────────────────────────────────────────────
  section("lib/saves.ts — the read side");

  check(await isListingSaved(userId, buyer.id), "isListingSaved: true for the real save above");
  check(!(await isListingSaved(userId, "nonexistent-listing-id")), "isListingSaved: false for a nonexistent listing");
  check(!(await isListingSaved(null, buyer.id)), "isListingSaved: false for a null (anonymous) userId — no query needed");

  const batch = await savedListingIds(userId, [buyer.id, "nonexistent-listing-id"]);
  check(batch.has(buyer.id) && batch.size === 1, "savedListingIds: batch lookup returns exactly the saved subset");
  const emptyBatch = await savedListingIds(null, [buyer.id]);
  check(emptyBatch.size === 0, "savedListingIds: an anonymous viewer gets an empty set without querying");
  const noIdsBatch = await savedListingIds(userId, []);
  check(noIdsBatch.size === 0, "savedListingIds: an empty listing-id list short-circuits");

  await prisma.foodSave.deleteMany({ where: { userId } });

  // ──────────────────────────────────────────────────────────────────────
  section('"More from this seller" (Part E4 Phase 1)');

  const sellerCounts = await prisma.foodListing.groupBy({
    by: ["sellerId"],
    where: { active: true, seller: { status: "ACTIVE" } },
    _count: { id: true },
  });
  const sellerWithMany = sellerCounts.find((s) => s._count.id > 1);
  if (!sellerWithMany) throw new Error("no ACTIVE seller with 2+ listings in the seed");
  const anchorListing = await prisma.foodListing.findFirstOrThrow({
    where: { sellerId: sellerWithMany.sellerId, active: true },
    select: { id: true, sellerId: true },
  });

  const more = await moreFromSeller(anchorListing.sellerId, anchorListing.id, 50);
  check(more.length > 0, `moreFromSeller returns other listings from the same seller (${more.length})`);
  check(
    more.every((l) => l.seller.slug !== undefined && l.id !== anchorListing.id),
    "…and never includes the anchor listing itself",
  );
  check(
    more.every((l) => l.seller && !HIDDEN_SELLERS.includes(l.seller.slug)),
    "…and (structurally) can never surface a non-ACTIVE seller — it goes through DISCOVERABLE",
  );

  const selfOnly = await moreFromSeller(anchorListing.sellerId, anchorListing.id, 50);
  check(!selfOnly.some((l) => l.id === anchorListing.id), "…re-confirmed: excludeListingId is honoured every call");

  // ──────────────────────────────────────────────────────────────────────
  section('"Similar in {category}" (Part E4 Phase 1)');

  const categoryCounts = await prisma.foodListingCategory.groupBy({
    by: ["categoryId"],
    _count: { listingId: true },
  });
  const categoryWithMany = categoryCounts.find((c) => c._count.listingId > 1);
  if (!categoryWithMany) throw new Error("no category with 2+ listings in the seed");
  const categoryId = categoryWithMany.categoryId;
  const anchorInCategory = await prisma.foodListing.findFirstOrThrow({
    where: { categories: { some: { categoryId } }, active: true, seller: { status: "ACTIVE" } },
    select: { id: true },
  });

  const similar = await similarInCategory(categoryId, anchorInCategory.id, 50);
  check(similar.length > 0, `similarInCategory returns other listings sharing the category (${similar.length})`);
  check(
    !similar.some((l) => l.id === anchorInCategory.id),
    "…and never includes the anchor listing itself",
  );

  const similarIds = new Set(similar.map((l) => l.id));
  const trueMembers = await prisma.foodListingCategory.findMany({
    where: { categoryId, listingId: { in: [...similarIds] } },
    select: { listingId: true },
  });
  check(
    trueMembers.length === similarIds.size,
    "…and every returned listing really carries that category (no cross-category leak)",
  );

  // The SUSPENDED-seller trap (Slice 8/9): if their listing happens to share
  // this category, it must still never surface.
  const suspendedInCategory = await prisma.foodListing.findFirst({
    where: { categories: { some: { categoryId } }, seller: { slug: { in: HIDDEN_SELLERS } } },
    select: { id: true },
  });
  if (suspendedInCategory) {
    check(
      !similar.some((l) => l.id === suspendedInCategory.id),
      "…and a suspended/pending seller's listing in the same category never leaks",
    );
  } else {
    console.log("  (skip — no hidden-seller listing shares this particular category; trap not exercised here)");
  }

  // ──────────────────────────────────────────────────────────────────────
  section("SAVE demand event (Part E4/E7)");

  await recordDemandEvent({ kind: "SAVE", listingId: buyer.id, sellerId: buyer.sellerId, userId });
  const saveEvent = await prisma.foodDemandEvent.findFirst({
    where: { kind: "SAVE", listingId: buyer.id },
    orderBy: { createdAt: "desc" },
  });
  check(saveEvent !== null, "a SAVE event is written");
  check(saveEvent?.sellerId === buyer.sellerId, "…carrying the seller id (Part E7's per-seller aggregates need it)");
  check(
    !!saveEvent?.userIdHash && saveEvent.userIdHash.length === 32,
    "…and the identity is hashed, same as every other demand event",
  );
  await prisma.foodDemandEvent.deleteMany({ where: { kind: "SAVE", listingId: buyer.id, userIdHash: saveEvent?.userIdHash } });

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
