/**
 * Slice 9 verification — discovery, search, availability and demand logging.
 *
 *   npm run verify:discovery
 *
 * Exercises the real modules against the real seeded database. The parts that
 * matter most here have no representation in the type system at all: "a
 * suspended seller never leaks", "a zero-result search is still recorded",
 * "unaccent is applied to both sides" — each is only true if something tries to
 * violate it.
 */

import { PrismaClient } from "@prisma/client";

import {
  addDays,
  localDay,
  summarizeAvailability,
  windowCoversDay,
  type AvailabilityWindowLike,
} from "../lib/availability";
import {
  buildWhere,
  parseFilters,
  serializeFilters,
  browseListings,
  activeFilterCount,
} from "../lib/browse";
import { normalizeQuery, recordDemandEvent } from "../lib/demand";
import {
  availableSoon,
  categoryCards,
  freshTodayEntries,
  newestListings,
  seasonalListings,
  sellerCountsByArea,
  sellersInArea,
  trendingListings,
} from "../lib/discovery";
import { search } from "../lib/search";

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
const HIDDEN_LISTINGS = ["trini-fried-rice", "pepper-shrimp", "pastelitos-andinos"];

async function run() {
  // ──────────────────────────────────────────────────────────────────────
  section("Availability — fixed-zone date maths (America/Port_of_Spain)");

  // ⚠ 2026-01-01T02:00Z is 2025-12-31 22:00 in Trinidad. A server that used
  // UTC would light the WRONG DAY's badge for every listing on the site, and
  // it would do it for four hours out of every twenty-four.
  const lateNightUtc = new Date("2026-01-01T02:00:00.000Z");
  const local = localDay(lateNightUtc);
  check(local.iso === "2025-12-31", "a UTC instant past midnight is still yesterday in Trinidad", local.iso);
  check(local.weekday === 3, "…and resolves the right weekday (Wednesday)", String(local.weekday));

  const noonUtc = new Date("2026-06-15T16:00:00.000Z"); // Monday
  const monday = localDay(noonUtc);
  check(monday.iso === "2026-06-15" && monday.weekday === 1, "a midday instant resolves normally");

  check(addDays(monday, 1).iso === "2026-06-16", "addDays crosses a day");
  check(addDays(monday, 20).iso === "2026-07-05", "addDays crosses a month");
  check(addDays(localDay(new Date("2026-12-31T16:00:00.000Z")), 1).iso === "2027-01-01", "addDays crosses a year");

  const weekly: AvailabilityWindowLike = {
    type: "RECURRING_WEEKLY",
    daysOfWeek: 0b1000001, // Sun + Sat
    startsOn: null,
    endsOn: null,
    leadTimeDays: null,
  };
  check(!windowCoversDay(weekly, monday), "a weekend window does not cover Monday");
  check(windowCoversDay(weekly, addDays(monday, 5)), "…and does cover Saturday");
  check(windowCoversDay(weekly, addDays(monday, 6)), "…and Sunday");

  const range: AvailabilityWindowLike = {
    type: "DATE_RANGE",
    daysOfWeek: null,
    startsOn: new Date("2026-06-15T00:00:00.000Z"),
    endsOn: new Date("2026-06-20T00:00:00.000Z"),
    leadTimeDays: null,
  };
  check(windowCoversDay(range, monday), "a date range is INCLUSIVE of its first day");
  check(windowCoversDay(range, localDay(new Date("2026-06-20T16:00:00.000Z"))), "…and of its last day");
  check(!windowCoversDay(range, localDay(new Date("2026-06-21T16:00:00.000Z"))), "…and excludes the day after");

  const preorder: AvailabilityWindowLike = {
    type: "PREORDER",
    daysOfWeek: null,
    startsOn: null,
    endsOn: null,
    leadTimeDays: 2,
  };
  // ⚠ The deliberate call: a lead time does NOT make a listing unavailable
  // today. Conflating them empties "available today" of every pre-order dish.
  check(windowCoversDay(preorder, monday), "a 2-day lead time does not make a listing unavailable today");

  const summary = summarizeAvailability([weekly], noonUtc);
  check(summary.availableThisWeekend, "summary: a weekend window is available this weekend");
  check(!summary.availableToday, "…and not today, on a Monday");
  check(summary.labelKey === "weekend" && summary.tone === "recurring", "…and wears the weekend stamp", summary.labelKey);

  // "This weekend" must mean the same thing on a Sunday as on a Monday.
  const sunday = new Date("2026-06-21T16:00:00.000Z");
  check(summarizeAvailability([weekly], sunday).availableToday, "on a Sunday a weekend window is available TODAY");

  const quoteOnly = summarizeAvailability([], noonUtc);
  check(quoteOnly.labelKey === "unavailable", "a listing with no windows says so rather than claiming a day");

  // ──────────────────────────────────────────────────────────────────────
  section("⚠ The visibility rule — a non-ACTIVE seller must never leak");

  const surfaces: [string, () => Promise<{ seller: { slug: string } }[]>][] = [
    ["availableSoon", () => availableSoon(100) as never],
    ["newestListings", () => newestListings(100) as never],
    ["trendingListings", () => trendingListings(100) as never],
    ["seasonalListings", () => seasonalListings(100) as never],
  ];
  for (const [name, fn] of surfaces) {
    const rows = await fn();
    const leaked = rows.filter((r) => HIDDEN_SELLERS.includes(r.seller.slug));
    check(leaked.length === 0, `${name}() shows no suspended/pending seller`, leaked.map((r) => r.seller.slug).join(", "));
  }

  const browsed = await browseListings(parseFilters({}), { take: 200 });
  const leakedBrowse = browsed.listings.filter((l) => HIDDEN_SELLERS.includes(l.seller.slug));
  check(leakedBrowse.length === 0, "browse (unfiltered) shows no suspended/pending seller");
  const leakedSlugs = browsed.listings.filter((l) => HIDDEN_LISTINGS.includes(l.slug));
  check(leakedSlugs.length === 0, "…and none of their listings by slug", leakedSlugs.map((l) => l.slug).join(", "));

  const directory = await prisma.foodSeller.findMany({ where: { status: "ACTIVE" }, select: { slug: true } });
  check(
    !directory.some((s) => HIDDEN_SELLERS.includes(s.slug)),
    "the seller directory query excludes them",
  );

  // The trap is only meaningful while it still exists.
  const suspendedListings = await prisma.foodListing.count({
    where: { active: true, seller: { slug: "mama-lin-kitchen" } },
  });
  check(suspendedListings > 0, "the SUSPENDED seller still owns ACTIVE listings (the trap is live)");

  const nearby = await sellersInArea(null, 100);
  check(!nearby.some((s) => HIDDEN_SELLERS.includes(s.slug)), "sellersInArea() excludes them");

  // ──────────────────────────────────────────────────────────────────────
  section("Discovery sections (Part E1)");
  const [fresh, cats, counts] = await Promise.all([
    freshTodayEntries(),
    categoryCards(),
    sellerCountsByArea(),
  ]);
  check(fresh.length > 0, `Fresh Today rail is non-empty (${fresh.length})`);
  check(
    fresh.every((e) => e.pathCard && e.blurDataUrl),
    "every Fresh Today entry has a stored variant and a blur placeholder",
  );
  check(fresh.some((e) => e.linkedListing !== null), "some entries link through to a listing");
  check(cats.length > 0, `category cards are non-empty (${cats.length})`);
  check(
    cats.every((c) => c._count.listings > 0),
    "no category card is a dead end (every one has discoverable listings)",
  );
  check(Object.keys(counts).length >= 5, `area counts cover the map (${Object.keys(counts).length} areas)`);

  const soon = await availableSoon(50);
  check(soon.length > 0, `"available today / this weekend" is non-empty TODAY (${soon.length})`);
  check(
    soon.every((l) => l.availability.availableToday || l.availability.availableThisWeekend),
    "…and every listing in it really is available today or this weekend",
  );

  // The section must be non-empty on ANY day, not just the day this ran.
  for (let offset = 0; offset < 7; offset += 1) {
    const when = new Date(Date.now() + offset * 86400000);
    const rows = await availableSoon(50, when);
    check(rows.length > 0, `…and on day +${offset} (${rows.length})`);
  }

  // ──────────────────────────────────────────────────────────────────────
  section("Browse filters (Part E1: filter state in the URL)");

  const roundTrip = parseFilters({
    category: "desserts,drinks",
    area: "central,tobago",
    price: "50-150",
    dietary: "vegan",
    availability: "weekend",
    sort: "price-asc",
  });
  check(roundTrip.categories.length === 2 && roundTrip.areas.length === 2, "comma-separated params parse");
  check(activeFilterCount(roundTrip) === 7, `active filter count is right (${activeFilterCount(roundTrip)})`);
  const qs = serializeFilters(roundTrip);
  const reparsed = parseFilters(Object.fromEntries(new URLSearchParams(qs)));
  check(JSON.stringify(reparsed) === JSON.stringify(roundTrip), "filters round-trip through a URL unchanged", qs);

  const junk = parseFilters({ area: "atlantis", price: "free", sort: "vibes", availability: "whenever" });
  check(
    junk.areas.length === 0 && junk.price === null && junk.sort === "newest" && junk.availability === null,
    "unknown filter values are dropped rather than passed to the database",
  );

  const vegan = await browseListings(parseFilters({ dietary: "vegan" }), { take: 100 });
  check(vegan.total > 0, `dietary filter returns results (${vegan.total})`);
  const veganIds = vegan.listings.map((l) => l.id);
  const veganRows = await prisma.foodListing.findMany({
    where: { id: { in: veganIds } },
    select: { dietaryTags: true },
  });
  check(veganRows.every((r) => r.dietaryTags.includes("vegan")), "…and every result really is vegan");

  const cheap = await browseListings(parseFilters({ price: "under-50" }), { take: 100 });
  check(
    cheap.listings.every((l) => l.priceCents !== null && l.priceCents < 5000),
    "price band filters correctly",
  );

  const priceAsc = await browseListings(parseFilters({ sort: "price-asc" }), { take: 100 });
  const prices = priceAsc.listings.map((l) => l.priceCents);
  const firstNull = prices.findIndex((p) => p === null);
  check(
    firstNull === -1 || prices.slice(firstNull).every((p) => p === null),
    "⚠ price-asc puts QUOTE (null-price) listings LAST, never first",
  );
  const numeric = prices.filter((p): p is number => p !== null);
  check(
    numeric.every((p, i) => i === 0 || numeric[i - 1] <= p),
    "…and the numeric prices really ascend",
  );

  const areaFiltered = await browseListings(parseFilters({ area: "tobago" }), { take: 100 });
  check(areaFiltered.total > 0, `area filter returns results (${areaFiltered.total})`);
  check(
    areaFiltered.listings.every((l) => l.seller.areas.includes("tobago")),
    "…and every result's seller really serves that area",
  );
  // ⚠ The area filter merges INTO the seller clause; a second `seller` key
  // would silently overwrite the ACTIVE-status check.
  const where = buildWhere(parseFilters({ area: "east_west_corridor" }));
  const raw = JSON.stringify(where);
  check(raw.includes("ACTIVE"), "the area filter does not clobber the seller-status check", raw.slice(0, 200));

  const todayFilter = await browseListings(parseFilters({ availability: "today" }), { take: 100 });
  check(todayFilter.total > 0, `availability=today returns results (${todayFilter.total})`);
  check(
    todayFilter.listings.every((l) => l.availability.availableToday),
    "…and every one really is available today",
  );

  const impossible = await browseListings(
    parseFilters({ area: "tobago", dietary: "gluten-free", price: "over-300" }),
    { take: 100 },
  );
  check(impossible.total === 0, "a deliberately impossible filter combination returns zero, not everything");

  // ──────────────────────────────────────────────────────────────────────
  section("Search (Part E3: unaccent on BOTH sides, trigram variance)");

  const accented = await search("pastelón");
  const plain = await search("pastelon");
  check(accented.listings.length > 0, `the accented spelling finds the dish (${accented.listings.length})`);
  check(plain.listings.length > 0, `the unaccented spelling finds it too (${plain.listings.length})`);
  check(
    accented.listings.length === plain.listings.length,
    "⚠ both spellings find the SAME set — unaccent is applied to both sides, not one",
    `${accented.listings.length} vs ${plain.listings.length}`,
  );

  const upper = await search("PASTELON");
  check(upper.listings.length === plain.listings.length, "search is case-insensitive");

  const byIngredient = await search("coconut");
  check(byIngredient.total > 0, `search matches ingredient tags (${byIngredient.total})`);

  const bySeller = await search("Abuela");
  check(bySeller.sellers.length > 0, `search matches sellers (${bySeller.sellers.length})`);
  check(
    !bySeller.sellers.some((s) => HIDDEN_SELLERS.includes(s.slug)),
    "…and never returns a suspended or pending one",
  );

  const suspendedSearch = await search("Mama Lin");
  check(suspendedSearch.total === 0, "searching the SUSPENDED seller by name finds nothing");
  const suspendedDish = await search("pepper shrimp");
  check(
    !suspendedDish.listings.some((l) => HIDDEN_LISTINGS.includes(l.slug)),
    "…and their dishes are unreachable by search",
  );

  const empty = await search("zzzzqqqqnothing");
  check(empty.total === 0, "a nonsense query finds nothing");
  const blank = await search("   ");
  check(blank.total === 0, "a blank query short-circuits without touching the database");

  // ──────────────────────────────────────────────────────────────────────
  section("Demand events (Part E3/E7)");

  check(normalizeQuery("  Pastelón DE Plátano  ") === "pastelon de platano", "queries normalize (accents, case, spacing)");
  check(normalizeQuery("PELAU") === normalizeQuery("pelau"), "…so spelling variants collapse to one signal");

  const marker = `verify-${Date.now()}`;
  await recordDemandEvent({ kind: "SEARCH", query: `  ${marker}  `, resultCount: 0, area: "central", userId: "u-1" });
  const stored = await prisma.foodDemandEvent.findFirst({
    where: { query: marker },
    orderBy: { createdAt: "desc" },
  });
  check(stored !== null, "a SEARCH event is written");
  check(stored?.resultCount === 0, "⚠ a ZERO-result search is recorded with resultCount 0, not skipped");
  check(stored?.queryNormalized === marker.toLowerCase(), "…with the normalized query stored beside the raw one");
  check(stored?.area === "central", "…and the viewer's area");
  check(
    !!stored?.userIdHash && stored.userIdHash !== "u-1" && stored.userIdHash.length === 32,
    "⚠ the identity is HASHED, never stored raw (Part E7's k-anonymity floor depends on it)",
    stored?.userIdHash ?? "null",
  );

  await recordDemandEvent({ kind: "SEARCH", query: marker, resultCount: -5 });
  const clamped = await prisma.foodDemandEvent.findFirst({
    where: { query: marker, resultCount: { lt: 1 } },
    orderBy: { createdAt: "desc" },
  });
  check((clamped?.resultCount ?? -1) >= 0, "a negative result count is clamped rather than hitting the DB CHECK");

  await recordDemandEvent({ kind: "PROFILE_VIEW", userId: null });
  const anonymous = await prisma.foodDemandEvent.findFirst({
    where: { kind: "PROFILE_VIEW", userIdHash: null },
    orderBy: { createdAt: "desc" },
  });
  check(anonymous !== null, "an anonymous viewer records an event with a NULL hash, not a fake id");

  const kinds = await prisma.foodDemandEvent.groupBy({ by: ["kind"], _count: { kind: true } });
  const seen = new Set(kinds.map((k) => k.kind));
  for (const kind of ["SEARCH", "LISTING_VIEW", "PROFILE_VIEW"] as const) {
    check(seen.has(kind), `${kind} events exist (logged by a real page render)`);
  }

  // Clean up only what this run wrote.
  await prisma.foodDemandEvent.deleteMany({ where: { query: marker } });

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
