/**
 * Schema verification — round-trips every model through the Prisma client and
 * proves the invariants that have no representation in `schema.prisma` are real
 * at the DATABASE level: the CHECK constraints, the extensions, the GIN index,
 * and the deletion behaviour.
 *
 * Committed rather than thrown away (Apparel Slice 2's precedent) because it is
 * the cheapest way for a later slice to confirm it hasn't broken the pricing and
 * availability semantics, which are this model's whole thesis.
 *
 * Idempotent and self-cleaning: every row it writes carries the `_verify-` slug
 * prefix and is removed before and after each run, so it is safe against a
 * database that already holds seed or demo data.
 *
 * Run: npm run db:verify
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const P = "_verify-";

let pass = 0;
let fail = 0;

function ok(label: string) {
  pass++;
  console.log(`  PASS  ${label}`);
}
function bad(label: string, detail?: unknown) {
  fail++;
  console.log(`  FAIL  ${label}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
}
function assert(label: string, condition: boolean, detail?: unknown) {
  condition ? ok(label) : bad(label, detail);
}
function section(title: string) {
  console.log(`\n${title}`);
}

/**
 * ⚠ Prisma reports constraint violations in TWO different shapes, and this
 * distinction is load-bearing for Slice 10's save idempotency and Slice 14's
 * listing validation (Apparel Slice 2 finding, re-asserted here against Food's
 * own constraints so the claim is measured, not inherited):
 *
 *   - Constraints Prisma MODELS (unique, foreign key) surface as recognised
 *     codes — P2002 / P2003 — with the offending columns in `.meta`, and the
 *     constraint's NAME IS NOT in the message text.
 *   - Constraints Prisma does NOT model (CHECK here; EXCLUDE in Salon) surface
 *     as an unknown-error whose message TEXT embeds the Postgres constraint
 *     name, with no usable `.code`.
 *
 * Any code that must tell "duplicate" from "invalid value" has to handle both.
 */
async function expectCheckViolation(label: string, constraint: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    bad(`${label} (expected rejection, row was ACCEPTED)`);
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    assert(label, message.includes(constraint), `constraint name not in message: ${message.slice(0, 160)}`);
  }
}

async function expectAccepted(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    ok(label);
  } catch (error) {
    bad(label, (error as Error)?.message);
  }
}

async function cleanup() {
  // Orders are Restrict-protected against seller/listing deletion, so they go
  // first; their items and messages cascade with them. Deleting the sellers then
  // cascades listings -> photos/windows/categories/saves, plus stories,
  // highlights and follows.
  await prisma.foodOrder.deleteMany({ where: { orderNumber: { startsWith: P } } });
  await prisma.foodSeller.deleteMany({ where: { slug: { startsWith: P } } });
  await prisma.foodCategory.deleteMany({ where: { slug: { startsWith: P } } });
  await prisma.foodDemandEvent.deleteMany({ where: { query: { startsWith: P } } });
  await prisma.foodNotification.deleteMany({ where: { userId: { startsWith: P } } });
}

async function main() {
  await cleanup();

  // ==========================================================================
  section("Extensions (architecture Part E3 — Postgres-native search)");
  // ==========================================================================
  const extensions = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm')
  `;
  const extNames = extensions.map((e) => e.extname);
  assert("unaccent installed", extNames.includes("unaccent"), extNames);
  assert("pg_trgm installed", extNames.includes("pg_trgm"), extNames);
  // Prove they actually WORK, not merely that the rows exist.
  const [{ unaccented }] = await prisma.$queryRaw<{ unaccented: string }[]>`
    SELECT unaccent('Pastelón de plátano') AS unaccented
  `;
  assert("unaccent() strips accents", unaccented === "Pastelon de platano", unaccented);
  const [{ sim }] = await prisma.$queryRaw<{ sim: number }[]>`
    SELECT similarity('pelau', 'pilau') AS sim
  `;
  assert("pg_trgm similarity() works on a real Trini spelling variant", sim > 0.3, sim);

  // ==========================================================================
  section("Naming convention (Apoyo-Demia casing, NOT Salon's)");
  // ==========================================================================
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'food_%'
  `;
  // ⚠ Stale since Slice 16 (added `food_reports`, an 18th table, without
  // updating this count — `db:verify` wasn't in that slice's own regression
  // list, which is how it went unnoticed). Now 19: the Slice 2 baseline (17)
  // + `food_reports` (Slice 16) + `food_platform_settings` (Slice 17).
  assert("19 food_* tables created", tables.length === 19, tables.length);
  const badlyNamed = tables.filter((t) => !/^food_[a-z_]+$/.test(t.table_name));
  assert("every table is snake_case", badlyNamed.length === 0, badlyNamed);
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'food_sellers'
  `;
  const camelColumns = columns.filter((c) => /[A-Z]/.test(c.column_name));
  assert("every column is snake_case", camelColumns.length === 0, camelColumns);

  // ==========================================================================
  section("GIN index on the enum array (area filtering)");
  // ==========================================================================
  // ⚠ Read the operator class from the CATALOG, not from `pg_indexes.indexdef`.
  // Prisma writes `USING GIN ("areas" array_ops)` into the migration and
  // Postgres builds exactly that — but `indexdef` reconstructs the DDL and OMITS
  // an operator class that is the default for the column's type, so it reads
  // back as a bare `USING gin (areas)`. Asserting on `indexdef` therefore fails
  // against a perfectly correct index. (Apparel's Slice 2 note quotes the
  // migration text, which is why this looks like a discrepancy and isn't one.)
  const ginIndexes = await prisma.$queryRaw<{ index_name: string; opclass: string; column_name: string }[]>`
    SELECT i.relname AS index_name, oc.opcname AS opclass, a.attname AS column_name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_am am ON am.oid = i.relam
    JOIN pg_opclass oc ON oc.oid = x.indclass[0]
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.indkey[0]
    WHERE t.relname = 'food_sellers' AND am.amname = 'gin'
  `;
  assert("GIN index on food_sellers exists", ginIndexes.length === 1, ginIndexes);
  assert(
    "…on the areas column, with the array_ops operator class",
    ginIndexes[0]?.column_name === "areas" && ginIndexes[0]?.opclass === "array_ops",
    ginIndexes[0],
  );

  // ==========================================================================
  section("Round-trip: core entities");
  // ==========================================================================
  const seller = await prisma.foodSeller.create({
    data: {
      userId: `${P}user-seller`,
      slug: `${P}cocina-de-ana`,
      displayName: "Cocina de Ana",
      bio: "Comida venezolana hecha en casa.",
      areas: ["north_west", "east_west_corridor"],
      languages: ["es", "en"],
      specialties: ["arepas", "pastelitos"],
      fulfillmentModes: ["PICKUP", "MEETUP"],
    },
  });
  assert("FoodSeller round-trips", seller.status === "PENDING" && seller.followerCount === 0);
  assert("…enum array persists in order", seller.areas.join(",") === "north_west,east_west_corridor", seller.areas);
  assert("…lat/lng exist and default NULL (Phase 9 seam)", seller.lat === null && seller.lng === null);

  const sellerPhoto = await prisma.foodSellerPhoto.create({
    data: {
      sellerId: seller.id,
      pathThumb: "sellers/a-thumb.webp",
      pathCard: "sellers/a-card.webp",
      pathFull: "sellers/a-full.webp",
      blurDataUrl: "data:image/jpeg;base64,AAAA",
      sortOrder: 0,
    },
  });
  assert("FoodSellerPhoto round-trips", !!sellerPhoto.id);

  const category = await prisma.foodCategory.create({
    data: { slug: `${P}postres`, nameEn: "Desserts", nameEs: "Postres", sortOrder: 99 },
  });
  assert("FoodCategory round-trips (bilingual names)", category.nameEs === "Postres" && !category.seasonal);

  const listing = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: `${P}quesillo`,
      title: "Quesillo venezolano",
      description: "Quesillo tradicional, 8 porciones.",
      kind: "SINGLE_ITEM",
      priceMode: "FIXED",
      priceCents: 12500,
      feedsCount: 8,
      dietaryTags: ["vegetarian"],
      ingredientTags: ["leche condensada", "huevos", "caramelo"],
      categories: { create: { categoryId: category.id } },
      photos: {
        create: {
          pathThumb: "listings/q-thumb.webp",
          pathCard: "listings/q-card.webp",
          pathFull: "listings/q-full.webp",
          blurDataUrl: "data:image/jpeg;base64,BBBB",
          sortOrder: 0,
        },
      },
    },
    include: { photos: true, categories: true },
  });
  assert("FoodListing round-trips with nested photo + category", listing.photos.length === 1 && listing.categories.length === 1);
  assert("…integer cents survive exactly", listing.priceCents === 12500);

  // ==========================================================================
  section("Round-trip: availability windows (all three types)");
  // ==========================================================================
  await expectAccepted("PREORDER window with leadTimeDays", () =>
    prisma.foodAvailabilityWindow.create({
      data: { listingId: listing.id, type: "PREORDER", leadTimeDays: 2, note: "Pedidos hasta las 4pm del viernes" },
    }),
  );
  await expectAccepted("RECURRING_WEEKLY window with a day bitmask", () =>
    prisma.foodAvailabilityWindow.create({
      data: { listingId: listing.id, type: "RECURRING_WEEKLY", daysOfWeek: 0b1000001 }, // Sat + Sun
    }),
  );
  await expectAccepted("DATE_RANGE window, with a lead time alongside it", () =>
    prisma.foodAvailabilityWindow.create({
      data: {
        listingId: listing.id,
        type: "DATE_RANGE",
        startsOn: new Date("2026-12-01"),
        endsOn: new Date("2026-12-24"),
        leadTimeDays: 2, // deliberately allowed on any type — see the migration
      },
    }),
  );

  // ==========================================================================
  section("Round-trip: engagement entities");
  // ==========================================================================
  const highlight = await prisma.foodStoryHighlight.create({
    data: { sellerId: seller.id, title: "Especialidades", sortOrder: 0 },
  });
  const story = await prisma.foodStory.create({
    data: {
      sellerId: seller.id,
      pathThumb: "stories/s-thumb.webp",
      pathCard: "stories/s-card.webp",
      pathFull: "stories/s-full.webp",
      blurDataUrl: "data:image/jpeg;base64,CCCC",
      caption: "Quesillo recién hecho",
      linkedListingId: listing.id,
      highlightId: highlight.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  assert("FoodStory round-trips with linked listing + highlight", story.linkedListingId === listing.id && story.highlightId === highlight.id);

  await prisma.foodStoryView.create({ data: { storyId: story.id, userId: `${P}viewer` } });
  await prisma.foodFollow.create({ data: { sellerId: seller.id, userId: `${P}viewer` } });
  await prisma.foodSave.create({ data: { listingId: listing.id, userId: `${P}viewer` } });
  ok("FoodStoryView / FoodFollow / FoodSave round-trip");

  // ==========================================================================
  section("Round-trip: ordering entities");
  // ==========================================================================
  const order = await prisma.foodOrder.create({
    data: {
      orderNumber: `${P}FD-4821`,
      clientId: `${P}client`,
      sellerId: seller.id,
      fulfillmentMode: "PICKUP",
      fulfillmentAt: new Date("2026-12-20T18:00:00Z"),
      fulfillmentAreaOrNote: "Diego Martin — details after acceptance",
      respondBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
      subtotalCents: 12500,
      items: {
        create: { listingId: listing.id, titleSnapshot: "Quesillo venezolano", priceCentsSnapshot: 12500, quantity: 1 },
      },
      messages: {
        create: {
          senderUserId: `${P}client`,
          originalText: "¿Puede ser sin caramelo?",
          originalLocale: "es",
          translations: { en: "Can it be without caramel?" },
        },
      },
    },
    include: { items: true, messages: true },
  });
  assert("FoodOrder round-trips with items + thread message", order.items.length === 1 && order.messages.length === 1);
  assert("…status defaults to PENDING", order.status === "PENDING");
  assert(
    "…stored translations survive as JSON",
    (order.messages[0].translations as Record<string, string>).en === "Can it be without caramel?",
    order.messages[0].translations,
  );

  // ==========================================================================
  section("Round-trip: platform entities");
  // ==========================================================================
  const notification = await prisma.foodNotification.create({
    data: { userId: `${P}client`, kind: "ORDER_PLACED", payload: { orderNumber: `${P}FD-4821` } },
  });
  assert("FoodNotification round-trips, unread + un-emailed", notification.readAt === null && notification.emailedAt === null);

  const demandEvent = await prisma.foodDemandEvent.create({
    data: {
      kind: "SEARCH",
      userIdHash: "sha256:deadbeef",
      area: "north_west",
      query: `${P}Cheesecake`,
      queryNormalized: `${P}cheesecake`,
      resultCount: 0,
    },
  });
  assert("FoodDemandEvent round-trips a zero-result search", demandEvent.resultCount === 0);

  // The whole point of having no relations: an analytics row must be writable
  // for an entity that does not exist (or no longer exists).
  await expectAccepted("…and accepts a listingId that does not exist (no FK, by design)", () =>
    prisma.foodDemandEvent.create({
      data: { kind: "LISTING_VIEW", listingId: "no-such-listing-id", query: `${P}orphan` },
    }),
  );

  // ==========================================================================
  section("CHECK constraints reject what they exist to reject");
  // ==========================================================================
  await expectCheckViolation("4 service areas rejected (max 3)", "food_sellers_areas_max_three", () =>
    prisma.foodSeller.create({
      data: {
        userId: `${P}user-4areas`,
        slug: `${P}four-areas`,
        displayName: "Too many areas",
        areas: ["north_west", "central", "south_west", "tobago"],
      },
    }),
  );
  await expectAccepted("…but 3 areas, and 0 areas, are both accepted", async () => {
    await prisma.foodSeller.create({
      data: {
        userId: `${P}user-3areas`,
        slug: `${P}three-areas`,
        displayName: "Exactly three",
        areas: ["north_west", "central", "tobago"],
      },
    });
    // 0 areas must be legal: onboarding is skippable-and-resumable (Slice 13).
    await prisma.foodSeller.create({
      data: { userId: `${P}user-0areas`, slug: `${P}zero-areas`, displayName: "Mid-onboarding", areas: [] },
    });
  });

  await expectCheckViolation("FIXED listing without a price rejected", "food_listings_price_by_mode", () =>
    prisma.foodListing.create({
      data: {
        sellerId: seller.id,
        slug: `${P}no-price`,
        title: "x",
        description: "x",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
      },
    }),
  );
  await expectCheckViolation("QUOTE listing WITH a price rejected", "food_listings_price_by_mode", () =>
    prisma.foodListing.create({
      data: {
        sellerId: seller.id,
        slug: `${P}quote-priced`,
        title: "x",
        description: "x",
        kind: "CUSTOM",
        priceMode: "QUOTE",
        priceCents: 5000,
      },
    }),
  );
  await expectCheckViolation("negative price rejected", "food_listings_price_by_mode", () =>
    prisma.foodListing.create({
      data: {
        sellerId: seller.id,
        slug: `${P}negative`,
        title: "x",
        description: "x",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceCents: -1,
      },
    }),
  );
  await expectAccepted("…but priceCents = 0 IS accepted (giveaway is a real case)", () =>
    prisma.foodListing.create({
      data: {
        sellerId: seller.id,
        slug: `${P}free`,
        title: "Free sample",
        description: "x",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceCents: 0,
      },
    }),
  );

  await expectCheckViolation("PREORDER without leadTimeDays rejected", "food_availability_windows_fields_by_type", () =>
    prisma.foodAvailabilityWindow.create({ data: { listingId: listing.id, type: "PREORDER" } }),
  );
  await expectCheckViolation("RECURRING_WEEKLY without daysOfWeek rejected", "food_availability_windows_fields_by_type", () =>
    prisma.foodAvailabilityWindow.create({ data: { listingId: listing.id, type: "RECURRING_WEEKLY" } }),
  );
  await expectCheckViolation("daysOfWeek on a non-weekly window rejected", "food_availability_windows_fields_by_type", () =>
    prisma.foodAvailabilityWindow.create({ data: { listingId: listing.id, type: "PREORDER", leadTimeDays: 1, daysOfWeek: 3 } }),
  );
  await expectCheckViolation("daysOfWeek = 0 rejected (no days selected)", "food_availability_windows_fields_by_type", () =>
    prisma.foodAvailabilityWindow.create({ data: { listingId: listing.id, type: "RECURRING_WEEKLY", daysOfWeek: 0 } }),
  );
  await expectCheckViolation("backwards DATE_RANGE rejected", "food_availability_windows_fields_by_type", () =>
    prisma.foodAvailabilityWindow.create({
      data: { listingId: listing.id, type: "DATE_RANGE", startsOn: new Date("2026-12-24"), endsOn: new Date("2026-12-01") },
    }),
  );

  await expectCheckViolation("order line with quantity 0 rejected", "food_order_items_quantity_positive", () =>
    prisma.foodOrderItem.create({
      data: { orderId: order.id, listingId: listing.id, titleSnapshot: "x", quantity: 0 },
    }),
  );
  await expectCheckViolation("story expiring before it was created rejected", "food_stories_expires_after_created", () =>
    prisma.foodStory.create({
      data: {
        sellerId: seller.id,
        pathThumb: "a",
        pathCard: "b",
        pathFull: "c",
        blurDataUrl: "d",
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    }),
  );
  await expectCheckViolation("negative search result count rejected", "food_demand_events_result_count_non_negative", () =>
    prisma.foodDemandEvent.create({ data: { kind: "SEARCH", query: `${P}bad`, resultCount: -1 } }),
  );

  // ==========================================================================
  section("The two shapes of a Prisma constraint violation (Apparel finding)");
  // ==========================================================================
  try {
    await prisma.foodSave.create({ data: { listingId: listing.id, userId: `${P}viewer` } });
    bad("duplicate save rejected");
  } catch (error) {
    const known = error instanceof Prisma.PrismaClientKnownRequestError;
    assert("duplicate save -> a RECOGNISED code (P2002), not message text", known && error.code === "P2002", error);
    if (known) {
      assert(
        "…columns are in .meta.target, and the constraint name is NOT in the message",
        JSON.stringify(error.meta ?? {}).includes("user_id") && !error.message.includes("food_saves_user_id_listing_id_key"),
        { meta: error.meta },
      );
    }
  }
  // …versus a CHECK, which has no usable .code at all. Slice 10's save
  // idempotency and Slice 14's validation must branch on BOTH shapes.
  try {
    await prisma.foodOrderItem.create({ data: { orderId: order.id, listingId: listing.id, titleSnapshot: "x", quantity: 0 } });
    bad("CHECK violation shape");
  } catch (error) {
    const known = error instanceof Prisma.PrismaClientKnownRequestError;
    assert(
      "CHECK violation -> NOT a known code; name only in the message text",
      !known && String((error as Error).message).includes("food_order_items_quantity_positive"),
      error,
    );
  }

  // ==========================================================================
  section("Deletion behaviour");
  // ==========================================================================
  // Restrict: an order is append-only evidence for BOTH parties.
  try {
    await prisma.foodListing.delete({ where: { id: listing.id } });
    bad("deleting a listing that has order items is BLOCKED");
  } catch (error) {
    const known = error instanceof Prisma.PrismaClientKnownRequestError;
    assert("deleting a listing that has order items is BLOCKED (P2003)", known && error.code === "P2003", error);
  }
  try {
    await prisma.foodSeller.delete({ where: { id: seller.id } });
    bad("deleting a seller that has orders is BLOCKED");
  } catch (error) {
    const known = error instanceof Prisma.PrismaClientKnownRequestError;
    assert("deleting a seller that has orders is BLOCKED (P2003)", known && error.code === "P2003", error);
  }

  // Cascade: owned presentation data goes with its parent, once the evidence
  // that was protecting it is gone.
  await prisma.foodOrder.delete({ where: { id: order.id } });
  assert(
    "deleting an order cascades its items and messages",
    (await prisma.foodOrderItem.count({ where: { orderId: order.id } })) === 0 &&
      (await prisma.foodOrderMessage.count({ where: { orderId: order.id } })) === 0,
  );

  await prisma.foodSeller.delete({ where: { id: seller.id } });
  const orphans = {
    listings: await prisma.foodListing.count({ where: { sellerId: seller.id } }),
    photos: await prisma.foodSellerPhoto.count({ where: { sellerId: seller.id } }),
    stories: await prisma.foodStory.count({ where: { sellerId: seller.id } }),
    highlights: await prisma.foodStoryHighlight.count({ where: { sellerId: seller.id } }),
    follows: await prisma.foodFollow.count({ where: { sellerId: seller.id } }),
    saves: await prisma.foodSave.count({ where: { listingId: listing.id } }),
    windows: await prisma.foodAvailabilityWindow.count({ where: { listingId: listing.id } }),
    views: await prisma.foodStoryView.count({ where: { storyId: story.id } }),
  };
  assert(
    "deleting a seller cascades listings, photos, stories, highlights, follows, saves, windows, views",
    Object.values(orphans).every((n) => n === 0),
    orphans,
  );

  // …but the analytics history survives all of it, which is the entire reason
  // FoodDemandEvent carries no relations.
  const survivors = await prisma.foodDemandEvent.count({ where: { query: { startsWith: P } } });
  assert("…while demand events SURVIVE the entity they describe", survivors === 2, survivors);

  await cleanup();

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
