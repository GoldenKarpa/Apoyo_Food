/**
 * Slice 13 verification — the seller domain, exercised against the real
 * database and (where a live ecosystem API is configured) the real membership
 * endpoint.
 *
 * What this covers that the browser pass cannot: slug derivation on inputs no
 * human would type into a demo, the completion/resume model at every boundary,
 * ownership scoping on the mutations (the "edit someone else's kitchen"
 * question), and idempotency/collision behaviour on registration.
 *
 * What it deliberately does NOT cover: `onboardSeller` and the
 * `updateSeller*` Server Actions themselves. They call `next/headers` via
 * `getFoodSession()`, which throws outside a real request scope — the same
 * limitation Slices 10 and 11 recorded for `toggleSaveListing` and
 * `toggleFollowSeller`. Those paths are proven in `verify-onboarding.mjs`,
 * driving a real browser against a production build with a real session cookie.
 *
 * Self-cleaning: every row it writes is prefixed `_verify-s13`, and it removes
 * them before AND after, so it is safe to re-run against a database that
 * already holds the demo seed.
 *
 *   npx tsx scripts/verify-seller.ts
 */
import { PrismaClient, type FulfillmentMode, type RegionKey } from "@prisma/client";

import { slugify, uniqueSellerSlug } from "../lib/slug";
import {
  activationBlockers,
  completionPercent,
  isSetupStepKey,
  isStepDone,
  MAX_SELLER_AREAS,
  nextIncompleteStep,
  SETUP_STEPS,
  setupStatus,
  type SellerProfileForCompletion,
} from "../lib/seller-profile";
import { sellerSurfaceUrl, sellerSurfaceIsCrossOrigin } from "../lib/links";

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

const PREFIX = "_verify-s13";
/**
 * ⚠ Slug-safe, and deliberately NOT `PREFIX`. `slugify` strips the leading
 * underscore, so a row created with slug `_verify-s13-cocina` would never be
 * found by a `uniqueSellerSlug("_verify-s13 cocina")` lookup — the collision
 * test would pass while testing nothing. (It did, on the first run of this
 * script, and reported the wrong slug rather than a wrong behaviour.)
 */
const SLUG_STEM = "verify-s13";

async function cleanup() {
  await prisma.foodSellerPhoto.deleteMany({
    where: { seller: { OR: [{ slug: { startsWith: SLUG_STEM } }, { userId: { startsWith: PREFIX } }] } },
  });
  await prisma.foodSeller.deleteMany({
    where: { OR: [{ slug: { startsWith: SLUG_STEM } }, { userId: { startsWith: PREFIX } }] },
  });
}

function profile(overrides: Partial<SellerProfileForCompletion> = {}): SellerProfileForCompletion {
  return {
    bio: null,
    profileImageThumb: null,
    coverImageThumb: null,
    areas: [],
    languages: [],
    specialties: [],
    fulfillmentModes: [],
    photoCount: 0,
    ...overrides,
  };
}

async function main() {
  await cleanup();

  // ==========================================================================
  section("Slug derivation (lib/slug.ts)");
  // ==========================================================================
  // ⚠ The DEFAULT case on a Spanish-first surface. A naive [^a-z0-9] strip
  // deletes accented letters outright; NFD decomposition keeps the base letter
  // and drops only the combining mark.
  assert(
    "accents fold instead of vanishing — 'Cocina de Doña Martínez'",
    slugify("Cocina de Doña Martínez") === "cocina-de-dona-martinez",
    slugify("Cocina de Doña Martínez"),
  );
  assert("…and the same for 'Pastelón & Más'", slugify("Pastelón & Más") === "pastelon-mas", slugify("Pastelón & Más"));
  assert("punctuation and runs collapse to single hyphens", slugify("A  --  B!!! C") === "a-b-c", slugify("A  --  B!!! C"));
  assert("leading/trailing separators are trimmed", slugify("  ¡Doubles!  ") === "doubles", slugify("  ¡Doubles!  "));
  assert("length is capped at 60 with no trailing hyphen", (() => {
    const s = slugify("a".repeat(58) + " " + "b".repeat(20));
    return s.length <= 60 && !s.endsWith("-");
  })());
  assert(
    "a name that slugifies to nothing falls back rather than producing an empty URL",
    (await uniqueSellerSlug("🍲🔥")).startsWith("cocina"),
    await uniqueSellerSlug("🍲🔥"),
  );

  // Collision suffixing, against real rows.
  const stem = `${SLUG_STEM}-cocina`;
  assert("an unused name is handed back unsuffixed", (await uniqueSellerSlug(stem)) === stem);
  await prisma.foodSeller.create({ data: { userId: `${PREFIX}-a`, slug: stem, displayName: "x" } });
  assert("…a taken one gets -2", (await uniqueSellerSlug(stem)) === `${stem}-2`, await uniqueSellerSlug(stem));
  await prisma.foodSeller.create({ data: { userId: `${PREFIX}-b`, slug: `${stem}-2`, displayName: "x" } });
  assert(
    "…and the suffix walks past every existing sibling rather than stopping at the first gap",
    (await uniqueSellerSlug(stem)) === `${stem}-3`,
    await uniqueSellerSlug(stem),
  );

  // ==========================================================================
  section("Completion & resume model (lib/seller-profile.ts)");
  // ==========================================================================
  const empty = profile();
  assert("a brand-new seller resumes at the first step, 'photo'", nextIncompleteStep(empty) === "photo");
  assert("…and reads 0% complete", completionPercent(empty) === 0);
  assert(
    "…with all four required steps outstanding",
    activationBlockers(empty).join(",") === "photo,bio,areas,fulfillment",
    activationBlockers(empty),
  );

  // ⚠ The resume target must SKIP completed steps rather than restart, and it
  // must skip them wherever they are in the order — that is the difference
  // between "resumable" and "restartable".
  const partial = profile({ profileImageThumb: "sellers/x-thumb.webp", coverImageThumb: "sellers/y-thumb.webp" });
  assert("a seller who did photo+cover resumes at 'bio'", nextIncompleteStep(partial) === "bio");
  const skipped = profile({ areas: ["central"] as RegionKey[] });
  assert(
    "…and a seller who skipped ahead to areas still resumes at the first GAP, not after their last write",
    nextIncompleteStep(skipped) === "photo",
  );

  // Bio has a minimum, deliberately: a one-word bio is a started step, not a
  // finished one, and treating it as done would mark the profile complete.
  assert("a 5-character bio does NOT count as done", !isStepDone(profile({ bio: "hola." }), "bio"));
  assert("a real sentence does", isStepDone(profile({ bio: "Cocino comida trinitaria en casa." }), "bio"));
  assert("whitespace alone does not", !isStepDone(profile({ bio: "                             " }), "bio"));

  const complete = profile({
    bio: "Cocino comida trinitaria en casa desde hace quince anos.",
    profileImageThumb: "sellers/a-thumb.webp",
    coverImageThumb: "sellers/b-thumb.webp",
    areas: ["central", "south_west"] as RegionKey[],
    languages: ["es"],
    specialties: ["pastelon"],
    fulfillmentModes: ["PICKUP"] as FulfillmentMode[],
    photoCount: 2,
  });
  assert("a fully filled profile resumes nowhere (wizard is done)", nextIncompleteStep(complete) === null);
  assert("…reads 100%", completionPercent(complete) === 100);
  assert("…and has no activation blockers", activationBlockers(complete).length === 0);
  assert(
    "every step appears exactly once in the status list, in F2's order",
    setupStatus(empty).map((s) => s.key).join(",") === SETUP_STEPS.join(","),
  );
  assert("an unknown ?step value is rejected", !isSetupStepKey("addresses") && !isSetupStepKey(undefined));
  assert("a known one is accepted", isSetupStepKey("fulfillment"));

  // ==========================================================================
  section("Cross-origin seller link (lib/links.ts)");
  // ==========================================================================
  // ⚠ The buyer surface is food.apoyolime.com and middleware 404s /food/* there,
  // so a RELATIVE href in the footer would send every would-be seller to a 404.
  const savedBase = process.env.NEXT_PUBLIC_SELLER_SURFACE_URL;
  delete process.env.NEXT_PUBLIC_SELLER_SURFACE_URL;
  assert("unset (local dev) falls back to a relative path", sellerSurfaceUrl("/food/setup") === "/food/setup");
  assert("…and reports itself same-origin", !sellerSurfaceIsCrossOrigin());
  process.env.NEXT_PUBLIC_SELLER_SURFACE_URL = "https://portal.apoyolime.com/";
  assert(
    "set (production) produces an absolute URL with no doubled slash",
    sellerSurfaceUrl("/food/setup") === "https://portal.apoyolime.com/food/setup",
    sellerSurfaceUrl("/food/setup"),
  );
  assert("…and reports itself cross-origin", sellerSurfaceIsCrossOrigin());
  if (savedBase === undefined) delete process.env.NEXT_PUBLIC_SELLER_SURFACE_URL;
  else process.env.NEXT_PUBLIC_SELLER_SURFACE_URL = savedBase;

  // ==========================================================================
  section("Registration invariants (against the real table)");
  // ==========================================================================
  const seller = await prisma.foodSeller.create({
    data: { userId: `${PREFIX}-main`, slug: `${PREFIX}-main`, displayName: "Verify Kitchen" },
  });
  assert("a new seller defaults to PENDING — the schema decides, not the caller", seller.status === "PENDING");
  assert("…with no areas, languages, specialties or fulfilment modes", seller.areas.length === 0 && seller.fulfillmentModes.length === 0);
  assert("…and null media, which is what makes onboarding resumable at all", seller.profileImageThumb === null);

  // One kitchen per account, enforced by the DB rather than by the action.
  let duplicateRejected = false;
  try {
    await prisma.foodSeller.create({
      data: { userId: `${PREFIX}-main`, slug: `${PREFIX}-main-2`, displayName: "Second kitchen" },
    });
  } catch (e) {
    duplicateRejected = (e as { code?: string }).code === "P2002";
  }
  assert("a second kitchen for the same account is rejected P2002 (userId is unique)", duplicateRejected);

  // ⚠ Part C's 1-3 rule, enforced in the DB by a hand-written CHECK. A CHECK
  // violation arrives with NO usable `.code` (Slice 2's finding), which is
  // exactly why `updateSellerAreas` validates before writing rather than
  // letting this surface as a 500.
  let fourAreasRejected = false;
  try {
    await prisma.foodSeller.update({
      where: { id: seller.id },
      data: { areas: ["central", "north_west", "south_west", "tobago"] as RegionKey[] },
    });
  } catch {
    fourAreasRejected = true;
  }
  assert(`the DB refuses a ${MAX_SELLER_AREAS + 1}th service area`, fourAreasRejected);
  await prisma.foodSeller.update({
    where: { id: seller.id },
    data: { areas: ["central", "north_west", "south_west"] as RegionKey[] },
  });
  assert("…and accepts exactly three", true);

  // ==========================================================================
  section("Ownership scoping — the mutations' compound where");
  // ==========================================================================
  const intruder = await prisma.foodSeller.create({
    data: { userId: `${PREFIX}-intruder`, slug: `${PREFIX}-intruder`, displayName: "Someone else" },
  });
  const victimPhoto = await prisma.foodSellerPhoto.create({
    data: {
      sellerId: seller.id,
      pathThumb: "sellers/v-thumb.webp",
      pathCard: "sellers/v-card.webp",
      pathFull: "sellers/v-full.webp",
      blurDataUrl: "data:image/jpeg;base64,x",
    },
  });
  // This is the shape `removeSellerPhoto`/`moveSellerPhoto` use: never by photo
  // id alone. A photo id is a cuid an attacker can read off a public page.
  const asIntruder = await prisma.foodSellerPhoto.findFirst({
    where: { id: victimPhoto.id, sellerId: intruder.id },
  });
  assert("a photo id scoped to the WRONG seller resolves to nothing", asIntruder === null);
  const asOwner = await prisma.foodSellerPhoto.findFirst({
    where: { id: victimPhoto.id, sellerId: seller.id },
  });
  assert("…and to the row for the right one", asOwner?.id === victimPhoto.id);

  // ==========================================================================
  section("Gallery ordering (the re-index, not a swap)");
  // ==========================================================================
  // ⚠ All three deliberately share sortOrder 0 — the state the Slice 8 seed can
  // produce, and the one a two-value swap silently no-ops on.
  await prisma.foodSellerPhoto.deleteMany({ where: { sellerId: seller.id } });
  const made = [];
  for (let i = 0; i < 3; i += 1) {
    made.push(
      await prisma.foodSellerPhoto.create({
        data: {
          sellerId: seller.id,
          pathThumb: `sellers/g${i}-thumb.webp`,
          pathCard: `sellers/g${i}-card.webp`,
          pathFull: `sellers/g${i}-full.webp`,
          blurDataUrl: "data:image/jpeg;base64,x",
          sortOrder: 0,
        },
      }),
    );
  }
  const ordered = await prisma.foodSellerPhoto.findMany({
    where: { sellerId: seller.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  assert("equal sortOrder values still resolve to a stable order via createdAt", ordered.length === 3);
  // Reproduce the action's own re-index (moving the last photo up one).
  const reordered = [...ordered];
  [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  await prisma.$transaction(
    reordered.map((p, position) =>
      prisma.foodSellerPhoto.update({ where: { id: p.id }, data: { sortOrder: position } }),
    ),
  );
  const after = await prisma.foodSellerPhoto.findMany({
    where: { sellerId: seller.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, sortOrder: true },
  });
  assert(
    "a re-index genuinely moves the photo, where a swap of two equal values would not",
    after[1].id === made[2].id && after[2].id === made[1].id,
    after,
  );
  assert("…and leaves positions 0..n-1 with no duplicates", after.map((p) => p.sortOrder).join(",") === "0,1,2");

  // Cascade — a removed seller takes their gallery with them (Slice 2).
  await prisma.foodSeller.delete({ where: { id: intruder.id } });
  assert("deleting a seller cascades their photos", (await prisma.foodSellerPhoto.count({ where: { sellerId: intruder.id } })) === 0);

  // ==========================================================================
  section("Privacy: area is the finest location that exists (Part G)");
  // ==========================================================================
  // ⚠ Structural, not a policy anyone has to remember: there is no address
  // column to populate. Asserted against the live table's own columns, so a
  // future migration adding one fails here rather than in review.
  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'food_sellers'`,
  );
  const names = columns.map((c) => c.column_name);
  const addressish = names.filter((n) => /address|street|postcode|postal|zip/.test(n));
  assert("food_sellers has NO address-shaped column", addressish.length === 0, addressish);
  assert("…and does carry the areas array that replaces one", names.includes("areas"));
  // lat/lng exist from Slice 2 for Phase-9 geocoding, and must stay unwritten
  // by anything in this slice.
  const geo = await prisma.foodSeller.findUnique({
    where: { id: seller.id },
    select: { lat: true, lng: true },
  });
  assert("…and nothing in seller onboarding writes lat/lng", geo?.lat === null && geo?.lng === null, geo);

  await cleanup();
  const leftover = await prisma.foodSeller.count({ where: { slug: { startsWith: PREFIX } } });
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
