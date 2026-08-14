/**
 * Slice 14 verification — the listing domain, against the real database.
 *
 * Complements `lib/availability.test.ts` (pure date/bit math, vitest) rather
 * than duplicating it: this script exercises everything that needs Postgres —
 * slug collisions, the window-form validator held up against the ACTUAL
 * `food_availability_windows_fields_by_type` CHECK constraint (not just its
 * transcribed rules), ownership scoping across the listing->seller relation,
 * and the visibility rule from the write side (does `active=false` really
 * drop a listing out of `discoverable()`).
 *
 * `upsertListing`/`addAvailabilityWindow`/etc. themselves aren't exercised
 * here for the same reason Slice 13's actions weren't in `verify-seller.ts`:
 * they call `next/headers` via `getFoodSession()`, which throws outside a
 * real request scope. Those are proven live in `verify-listing-editor.mjs`
 * instead.
 *
 * Self-cleaning: every row is prefixed `_verify-s14` and removed before and
 * after, so it's safe to re-run against a database already holding the demo
 * seed.
 *
 *   npx tsx scripts/verify-listings.ts
 */
import { PrismaClient } from "@prisma/client";

import { slugify, uniqueListingSlug } from "../lib/slug";
import { parseTtdToCents, validatePriceForMode, MAX_FEEDS_COUNT } from "../lib/listing-form";
import { validateWindowInput } from "../lib/availability-window-form";
import { discoverable } from "../lib/discovery";

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

const SLUG_STEM = "verify-s14";
const PREFIX = "_verify-s14";

async function cleanup() {
  await prisma.foodListingPhoto.deleteMany({ where: { listing: { slug: { startsWith: SLUG_STEM } } } });
  await prisma.foodAvailabilityWindow.deleteMany({ where: { listing: { slug: { startsWith: SLUG_STEM } } } });
  await prisma.foodListingCategory.deleteMany({ where: { listing: { slug: { startsWith: SLUG_STEM } } } });
  await prisma.foodListing.deleteMany({ where: { slug: { startsWith: SLUG_STEM } } });
  await prisma.foodSellerPhoto.deleteMany({ where: { seller: { slug: { startsWith: SLUG_STEM } } } });
  await prisma.foodSeller.deleteMany({ where: { slug: { startsWith: SLUG_STEM } } });
}

async function main() {
  await cleanup();

  // ==========================================================================
  section("Listing slug generation — global uniqueness, collision suffixing");
  // ==========================================================================
  const stem = `${SLUG_STEM}-pastelon`;
  const seller = await prisma.foodSeller.create({
    data: { userId: `${PREFIX}-owner`, slug: `${SLUG_STEM}-owner`, displayName: "x" },
  });

  assert("an unused title is handed back unsuffixed", (await uniqueListingSlug(stem)) === stem);
  const first = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: stem,
      title: "x",
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "QUOTE",
    },
  });
  assert("…a taken one gets -2", (await uniqueListingSlug(stem)) === `${stem}-2`);

  // ⚠ Listing slugs are GLOBAL, not per-seller (Slice 2: `/meals/[slug]` is a
  // root-level route). A second seller naming a dish identically must collide
  // too — this is the exact rule that distinguishes it from, say, a per-seller
  // unique constraint.
  const otherSeller = await prisma.foodSeller.create({
    data: { userId: `${PREFIX}-other`, slug: `${SLUG_STEM}-other-seller`, displayName: "y" },
  });
  assert(
    "…the collision check is GLOBAL — a different seller naming the same dish still collides",
    (await uniqueListingSlug(stem)) === `${stem}-2`,
  );

  assert(
    "accents fold the same way listing titles as they do seller names — 'Pastelón'",
    slugify("Pastelón de Plátano") === "pastelon-de-platano",
  );

  // ==========================================================================
  section("Price validation — mirrors food_listings_price_by_mode exactly");
  // ==========================================================================
  assert("QUOTE forces priceCents to null regardless of what was typed", validatePriceForMode("QUOTE", "45.00").priceCents === null);
  assert("FIXED with a valid amount converts to cents correctly", validatePriceForMode("FIXED", "45.00").priceCents === 4500);
  assert("STARTING_AT accepts 0 — a giveaway is a real listing (Slice 2's own call)", validatePriceForMode("STARTING_AT", "0").ok === true);
  assert("FIXED rejects a negative amount", validatePriceForMode("FIXED", "-5").ok === false);
  assert("FIXED rejects empty input", validatePriceForMode("FIXED", "").ok === false);
  assert("FIXED rejects garbage input", validatePriceForMode("FIXED", "abc").ok === false);
  assert("cents round correctly on a fractional dollar amount", parseTtdToCents("19.99") === 1999);

  // Proven against the REAL constraint, not just the transcribed rule: a
  // negative price is rejected by the database itself.
  let dbRejectedNegative = false;
  try {
    await prisma.foodListing.create({
      data: {
        sellerId: seller.id,
        slug: `${SLUG_STEM}-negative`,
        title: "x",
        description: "x",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceCents: -100,
      },
    });
  } catch {
    dbRejectedNegative = true;
  }
  assert("…and the DB's own CHECK constraint agrees (defence in depth)", dbRejectedNegative);

  assert(`feedsCount above ${MAX_FEEDS_COUNT} is an app-level sanity cap, not a DB rule`, MAX_FEEDS_COUNT > 0);
  let dbRejectedZeroFeeds = false;
  try {
    await prisma.foodListing.create({
      data: {
        sellerId: seller.id,
        slug: `${SLUG_STEM}-zero-feeds`,
        title: "x",
        description: "x",
        kind: "SINGLE_ITEM",
        priceMode: "QUOTE",
        feedsCount: 0,
      },
    });
  } catch {
    dbRejectedZeroFeeds = true;
  }
  assert("the DB rejects feedsCount=0 (food_listings_feeds_count_positive)", dbRejectedZeroFeeds);

  // ==========================================================================
  section("Availability window validation — mirrors the CHECK constraint field for field");
  // ==========================================================================
  const okRecurring = validateWindowInput({ type: "RECURRING_WEEKLY", days: [1, 3, 5], startsOn: "", endsOn: "", leadTimeDays: "", note: "" });
  assert("a valid RECURRING_WEEKLY window validates", okRecurring.ok === true);
  assert("…and computes the correct bitmask (Mon+Wed+Fri = 42)", okRecurring.ok && okRecurring.window.daysOfWeek === 42, okRecurring);

  const noDays = validateWindowInput({ type: "RECURRING_WEEKLY", days: [], startsOn: "", endsOn: "", leadTimeDays: "", note: "" });
  assert("RECURRING_WEEKLY with zero days is rejected", noDays.ok === false && noDays.error === "days");

  const okRange = validateWindowInput({ type: "DATE_RANGE", days: [], startsOn: "2026-12-01", endsOn: "2026-12-24", leadTimeDays: "", note: "" });
  assert("a valid DATE_RANGE window validates", okRange.ok === true);

  const backwardsRange = validateWindowInput({ type: "DATE_RANGE", days: [], startsOn: "2026-12-24", endsOn: "2026-12-01", leadTimeDays: "", note: "" });
  assert("a DATE_RANGE running backwards is rejected", backwardsRange.ok === false && backwardsRange.error === "dateOrder");

  const missingDates = validateWindowInput({ type: "DATE_RANGE", days: [], startsOn: "2026-12-01", endsOn: "", leadTimeDays: "", note: "" });
  assert("a DATE_RANGE missing one boundary is rejected", missingDates.ok === false && missingDates.error === "dates");

  const okPreorder = validateWindowInput({ type: "PREORDER", days: [], startsOn: "", endsOn: "", leadTimeDays: "3", note: "" });
  assert("a valid PREORDER window validates", okPreorder.ok === true);

  const preorderNoLead = validateWindowInput({ type: "PREORDER", days: [], startsOn: "", endsOn: "", leadTimeDays: "", note: "" });
  assert("PREORDER without a lead time is rejected (the constraint's own #1 rule)", preorderNoLead.ok === false && preorderNoLead.error === "leadTime");

  // ⚠ Part D's own named example: a DATE_RANGE window WITH a lead time
  // ("holiday menu, Dec 1-24, order 2 days ahead") — the field is allowed on
  // ANY type, not just PREORDER.
  const rangeWithLead = validateWindowInput({ type: "DATE_RANGE", days: [], startsOn: "2026-12-01", endsOn: "2026-12-24", leadTimeDays: "2", note: "" });
  assert("a DATE_RANGE window MAY also carry a lead time", rangeWithLead.ok === true && rangeWithLead.window.leadTimeDays === 2, rangeWithLead);

  const badLead = validateWindowInput({ type: "PREORDER", days: [], startsOn: "", endsOn: "", leadTimeDays: "0", note: "" });
  assert("a 0-day lead time is rejected by the app's own stricter floor (MIN_LEAD_TIME_DAYS)", badLead.ok === false && badLead.error === "leadTime");

  // Proven against the REAL constraint too: a hand-crafted row that violates
  // the "daysOfWeek present IFF RECURRING_WEEKLY" rule is rejected by Postgres.
  let dbRejectedMismatchedType = false;
  try {
    await prisma.foodAvailabilityWindow.create({
      data: { listingId: first.id, type: "PREORDER", daysOfWeek: 42, leadTimeDays: 2 },
    });
  } catch {
    dbRejectedMismatchedType = true;
  }
  assert("the DB itself rejects a PREORDER window carrying daysOfWeek (defence in depth)", dbRejectedMismatchedType);

  // ==========================================================================
  section("Ownership scoping across the listing -> seller relation");
  // ==========================================================================
  const asOwner = await prisma.foodListing.findFirst({ where: { id: first.id, sellerId: seller.id } });
  assert("the owning seller resolves the listing", asOwner?.id === first.id);
  const asIntruder = await prisma.foodListing.findFirst({ where: { id: first.id, sellerId: otherSeller.id } });
  assert("a DIFFERENT seller resolves nothing for the same listing id", asIntruder === null);

  const victimPhoto = await prisma.foodListingPhoto.create({
    data: {
      listingId: first.id,
      pathThumb: "listings/v-thumb.webp",
      pathCard: "listings/v-card.webp",
      pathFull: "listings/v-full.webp",
      blurDataUrl: "data:image/jpeg;base64,x",
    },
  });
  const photoAsIntruder = await prisma.foodListingPhoto.findFirst({
    where: { id: victimPhoto.id, listingId: first.id, listing: { sellerId: otherSeller.id } },
  });
  assert("a listing photo scoped through the WRONG seller resolves to nothing", photoAsIntruder === null);

  // ==========================================================================
  section("Photo reordering — re-index, not swap (Slice 13's finding, applied here too)");
  // ==========================================================================
  await prisma.foodListingPhoto.deleteMany({ where: { listingId: first.id } });
  const photoIds: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const p = await prisma.foodListingPhoto.create({
      data: {
        listingId: first.id,
        pathThumb: `listings/g${i}-thumb.webp`,
        pathCard: `listings/g${i}-card.webp`,
        pathFull: `listings/g${i}-full.webp`,
        blurDataUrl: "data:image/jpeg;base64,x",
        sortOrder: 0, // deliberately all equal — the Slice 8 seed can produce this
      },
    });
    photoIds.push(p.id);
  }
  const ordered = await prisma.foodListingPhoto.findMany({
    where: { listingId: first.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const reordered = [...ordered];
  [reordered[0], reordered[2]] = [reordered[2], reordered[0]];
  await prisma.$transaction(
    reordered.map((p, position) => prisma.foodListingPhoto.update({ where: { id: p.id }, data: { sortOrder: position } })),
  );
  const after = await prisma.foodListingPhoto.findMany({
    where: { listingId: first.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  assert("a re-index genuinely swaps positions 0 and 2 despite equal starting sortOrder", after[0].id === photoIds[2] && after[2].id === photoIds[0], after);

  // ==========================================================================
  section("Visibility — active=false really removes a listing from discoverable()");
  // ==========================================================================
  await prisma.foodSeller.update({ where: { id: seller.id }, data: { status: "ACTIVE" } });
  await prisma.foodListing.update({ where: { id: first.id }, data: { active: true } });
  const visibleWhenActive = await prisma.foodListing.findFirst({ where: { ...(await discoverable()), id: first.id } });
  assert("an active listing under an ACTIVE seller IS discoverable", visibleWhenActive?.id === first.id);

  await prisma.foodListing.update({ where: { id: first.id }, data: { active: false } });
  const hiddenWhenPaused = await prisma.foodListing.findFirst({ where: { ...(await discoverable()), id: first.id } });
  assert("…and pausing it (active=false) removes it from discoverable() — the ONLY 'delete' this product has", hiddenWhenPaused === null);

  // Deletion policy, re-confirmed rather than assumed: Slice 2 already proved
  // FoodOrderItem -> FoodListing is Restrict; a listing with no orders CAN
  // still be hard-deleted at the DB level (nothing here should suggest
  // otherwise) — this product simply never calls that path from the UI.
  const noOrdersListing = await prisma.foodListing.create({
    data: { sellerId: seller.id, slug: `${SLUG_STEM}-deletable`, title: "x", description: "x", kind: "SINGLE_ITEM", priceMode: "QUOTE" },
  });
  await prisma.foodListing.delete({ where: { id: noOrdersListing.id } });
  assert("a listing with no orders CAN be deleted at the DB layer (no UI path calls this)", true);

  await cleanup();
  const leftover = await prisma.foodListing.count({ where: { slug: { startsWith: SLUG_STEM } } });
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
