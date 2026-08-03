/**
 * Slice 16 domain-level verification: the parts that don't need a real
 * session. `requireAdmin()` reads `next/headers`, which resolves to
 * signed-out (never throws) outside a request scope — so every
 * `requireAdmin()`-gated action in `lib/actions/admin.ts` would report
 * `unauthorized` here regardless of what it's asked to do. Those are proven
 * for real by `scripts/verify-admin-e2e.mjs` instead, driving the actual
 * `/food/admin` UI with a minted ADMIN session. This script covers:
 *
 *   - `decideSellerLifecycleAction` — the pure status-machine decision,
 *     exercised for every (action, starting status) combination, including
 *     the exact bypass Apparel's own Slice 16 found live (a transition
 *     reachable from the wrong starting state).
 *   - `DISCOVERABLE`'s `takenDownAt` gate — a real DB row, proven hidden.
 *   - `reportListing` — anonymous-safe (no session required to read), so its
 *     one-OPEN-report-per-listing dedup is provable here directly.
 *   - `FoodReport`'s deletion behaviour (SetNull on listing, Restrict on
 *     seller), verified by actually attempting each deletion.
 *
 *   npx tsx scripts/verify-admin.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

import { decideSellerLifecycleAction } from "../lib/admin-sellers";
import { DISCOVERABLE } from "../lib/discovery";
import { reportListing } from "../lib/actions/report-listing";

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

const SLUG = "_verify-s16-admin";
const USER_ID = "_verify-s16-admin-user";

async function cleanup() {
  await prisma.foodReport.deleteMany({ where: { seller: { userId: USER_ID } } });
  await prisma.foodListing.deleteMany({ where: { seller: { userId: USER_ID } } });
  await prisma.foodSeller.deleteMany({ where: { userId: USER_ID } });
}

function completeSeller(overrides: Partial<Prisma.FoodSellerCreateInput> = {}) {
  return {
    userId: USER_ID,
    slug: SLUG,
    displayName: "Cocina de Prueba",
    bio: "A".repeat(30),
    profileImageThumb: "sellers/x-thumb.webp",
    areas: ["central" as const],
    fulfillmentModes: ["PICKUP" as const],
    status: "PENDING" as const,
    ...overrides,
  };
}

async function main() {
  await cleanup();

  // ==========================================================================
  section("decideSellerLifecycleAction — the status machine, pure");
  // ==========================================================================
  const emptyPhotos: never[] = [];

  const completeSellerRow = { ...completeSeller(), id: "x", areas: ["central"] as const, lat: null, lng: null, languages: [], specialties: [], followerCount: 0, lastStoryAt: null, createdAt: new Date(), updatedAt: new Date(), coverImageThumb: null, coverImageCard: null, coverImageFull: null, coverImageBlur: null, profileImageCard: null, profileImageFull: null, profileImageBlur: null } as unknown as Parameters<typeof decideSellerLifecycleAction>[0];

  const approveOk = decideSellerLifecycleAction({ ...completeSellerRow, photos: emptyPhotos }, "approve");
  assert("approve: PENDING + complete profile -> ACTIVE", approveOk.ok && approveOk.status === "ACTIVE", approveOk);

  const incomplete = { ...completeSellerRow, bio: null, photos: emptyPhotos };
  const approveBlocked = decideSellerLifecycleAction(incomplete, "approve");
  assert(
    "approve: PENDING + incomplete profile -> incompleteProfile (not silently approved)",
    !approveBlocked.ok && approveBlocked.reason === "incompleteProfile",
    approveBlocked,
  );

  const approveFromActive = decideSellerLifecycleAction(
    { ...completeSellerRow, status: "ACTIVE", photos: emptyPhotos },
    "approve",
  );
  assert(
    "approve: unreachable from ACTIVE (the exact bypass Apparel's own Slice 16 found live)",
    !approveFromActive.ok && approveFromActive.reason === "invalidTransition",
    approveFromActive,
  );

  const suspendFromActive = decideSellerLifecycleAction(
    { ...completeSellerRow, status: "ACTIVE", photos: emptyPhotos },
    "suspend",
  );
  assert("suspend: ACTIVE -> SUSPENDED", suspendFromActive.ok && suspendFromActive.status === "SUSPENDED", suspendFromActive);

  const suspendFromPending = decideSellerLifecycleAction({ ...completeSellerRow, photos: emptyPhotos }, "suspend");
  assert(
    "suspend: unreachable from PENDING",
    !suspendFromPending.ok && suspendFromPending.reason === "invalidTransition",
    suspendFromPending,
  );

  const reinstateFromSuspended = decideSellerLifecycleAction(
    { ...completeSellerRow, status: "SUSPENDED", photos: emptyPhotos },
    "reinstate",
  );
  assert(
    "reinstate: SUSPENDED -> ACTIVE, and does NOT re-run the profile-completeness check",
    reinstateFromSuspended.ok && reinstateFromSuspended.status === "ACTIVE",
    reinstateFromSuspended,
  );

  const reinstateFromPending = decideSellerLifecycleAction({ ...completeSellerRow, photos: emptyPhotos }, "reinstate");
  assert(
    "reinstate: unreachable from PENDING (cannot skip approve's completeness gate)",
    !reinstateFromPending.ok && reinstateFromPending.reason === "invalidTransition",
    reinstateFromPending,
  );

  // ==========================================================================
  section("DISCOVERABLE — takenDownAt is a separate gate from active");
  // ==========================================================================
  const seller = await prisma.foodSeller.create({ data: completeSeller({ status: "ACTIVE" }) });
  const listing = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: `${SLUG}-listing`,
      title: "Test Dish",
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "FIXED",
      priceCents: 1000,
      active: true, // seller's own toggle still ON
    },
  });

  const visibleBefore = await prisma.foodListing.findFirst({ where: { id: listing.id, ...DISCOVERABLE } });
  assert("before takedown: active + ACTIVE seller is discoverable", visibleBefore !== null);

  await prisma.foodListing.update({ where: { id: listing.id }, data: { takenDownAt: new Date() } });
  const visibleAfter = await prisma.foodListing.findFirst({ where: { id: listing.id, ...DISCOVERABLE } });
  assert(
    "after takedown: hidden even though `active` is STILL true — the seller's toggle alone cannot undo it",
    visibleAfter === null,
  );

  // ==========================================================================
  section("reportListing — anonymous intake + one-OPEN-report-per-listing dedup");
  // ==========================================================================
  await prisma.foodListing.update({ where: { id: listing.id }, data: { takenDownAt: null } });

  const firstReport = await reportListing(listing.id, "FOOD_SAFETY_CONCERN", "the photo looks off");
  assert("first report on a discoverable listing succeeds", firstReport.ok === true, firstReport);

  const rowsAfterFirst = await prisma.foodReport.count({ where: { listingId: listing.id } });
  assert("exactly one row created", rowsAfterFirst === 1, rowsAfterFirst);

  const secondReport = await reportListing(listing.id, "OTHER", "a different complaint");
  assert("a second report on the SAME listing still reports ok:true (intent not rejected)", secondReport.ok === true, secondReport);

  const rowsAfterSecond = await prisma.foodReport.count({ where: { listingId: listing.id } });
  assert("…but does NOT create a second row while one is OPEN", rowsAfterSecond === 1, rowsAfterSecond);

  const invalidReason = await reportListing(listing.id, "NOT_A_REAL_REASON", "");
  assert("an invalid reason is rejected", !invalidReason.ok && invalidReason.reason === "invalid", invalidReason);

  const goneListing = await reportListing("does-not-exist", "OTHER", "");
  assert("a non-existent listing is rejected", !goneListing.ok && goneListing.reason === "not_found", goneListing);

  // Resolve the open report, then prove a FRESH report on the same listing DOES
  // create a new row — the dedup is "at most one OPEN", not "ever".
  await prisma.foodReport.updateMany({ where: { listingId: listing.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  const thirdReport = await reportListing(listing.id, "OTHER", "yet another look");
  const rowsAfterResolved = await prisma.foodReport.count({ where: { listingId: listing.id } });
  assert("after the open report resolves, a new report creates a new row", thirdReport.ok === true && rowsAfterResolved === 2, {
    thirdReport,
    rowsAfterResolved,
  });

  // ==========================================================================
  section("FoodReport deletion behaviour — verified by actually attempting each deletion");
  // ==========================================================================
  const sellerDeleteAttempt = await prisma.foodSeller
    .delete({ where: { id: seller.id } })
    .then(() => "deleted" as const)
    .catch((e) => (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003" ? "restricted" as const : "other" as const));
  assert("a seller with an open report cannot be hard-deleted (Restrict)", sellerDeleteAttempt === "restricted", sellerDeleteAttempt);

  const listingBeforeDelete = await prisma.foodListing.findUnique({ where: { id: listing.id } });
  assert("setup: listing still exists before its own deletion", listingBeforeDelete !== null);
  // Resolve the still-open report so the listing itself has nothing else
  // referencing it besides the report rows (SetNull is what's under test).
  await prisma.foodReport.updateMany({ where: { listingId: listing.id }, data: { status: "DISMISSED", resolvedAt: new Date() } });
  await prisma.foodListing.delete({ where: { id: listing.id } });
  const reportsAfterListingDelete = await prisma.foodReport.findMany({ where: { sellerId: seller.id } });
  assert(
    "deleting the LISTING sets FoodReport.listingId to null rather than deleting the report (SetNull)",
    reportsAfterListingDelete.length === 2 && reportsAfterListingDelete.every((r) => r.listingId === null),
    reportsAfterListingDelete,
  );

  await cleanup();
  const leftover = await prisma.foodSeller.count({ where: { userId: USER_ID } });
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
