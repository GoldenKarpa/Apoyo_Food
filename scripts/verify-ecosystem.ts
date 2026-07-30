/**
 * Slice 3 verification — exercises Food's OWN `lib/ecosystem.ts` against a live
 * ecosystem API, rather than curl'ing the endpoints. Testing the client is the
 * point: a curl transcript proves the server works, not that this app talks to
 * it correctly.
 *
 * ⚠ Point this at a LOCAL portal-web backed by a THROWAWAY identity database.
 * Never run it against production — it creates memberships.
 *
 *   ECOSYSTEM_API_BASE_URL=http://localhost:3011 \
 *   ECOSYSTEM_SERVICE_TOKEN=<the food-app secret> \
 *   npx tsx scripts/verify-ecosystem.ts
 */
import {
  createMembership,
  getMemberships,
  getProviderRegistrationConfig,
  isFoodSeller,
} from "../lib/ecosystem";

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

/** Raw POST, bypassing lib/ecosystem.ts, so a rejection's STATUS is observable. */
async function rawCreateMembership(body: Record<string, unknown>): Promise<number> {
  const res = await fetch(
    `${process.env.ECOSYSTEM_API_BASE_URL}/api/ecosystem/v1/memberships`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ECOSYSTEM_SERVICE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  return res.status;
}

async function main() {
  const base = process.env.ECOSYSTEM_API_BASE_URL;
  if (!base) throw new Error("ECOSYSTEM_API_BASE_URL is required");
  if (!process.env.ECOSYSTEM_SERVICE_TOKEN) throw new Error("ECOSYSTEM_SERVICE_TOKEN is required");
  if (base.includes("apoyolime.com")) {
    throw new Error("refusing to run against a real ecosystem host — use a local portal-web");
  }
  console.log(`ecosystem base: ${base}`);

  const buyerId = process.argv[2];
  const sellerId = process.argv[3];
  if (!buyerId || !sellerId) {
    throw new Error("usage: verify-ecosystem.ts <buyerUserId> <sellerUserId>");
  }

  // ==========================================================================
  section("§6b registration config");
  // ==========================================================================
  const config = await getProviderRegistrationConfig();
  assert("config endpoint reachable and returns all four keys", Object.keys(config).length === 4, config);
  assert("…FOOD key is present (portal-web's SelectableVertical lists it)", "FOOD" in config, config);
  assert(
    "…FOOD reads false — seeded off, because onboarding lands in Slice 13",
    config.FOOD === false,
    config,
  );
  assert("…and the pre-existing verticals are untouched by this slice", config.SALON === true, config);

  // ==========================================================================
  section("Buyer: lazy (FOOD, CLIENT) mint on first commitment");
  // ==========================================================================
  const before = await getMemberships(buyerId);
  assert("a fresh user starts with no FOOD membership", !before.some((m) => m.vertical === "FOOD"), before);

  await createMembership({ userId: buyerId, vertical: "FOOD", role: "CLIENT" });
  const afterMint = await getMemberships(buyerId);
  assert(
    "…(FOOD, CLIENT) exists immediately after the write",
    afterMint.some((m) => m.vertical === "FOOD" && m.role === "CLIENT" && m.status === "ACTIVE"),
    afterMint,
  );
  // The TTL cache is 60s; without the write busting it, this read would be
  // stale and the guard would mint a second time on the next commitment.
  assert("…which proves the write busted the 60s TTL cache (not a stale read)", afterMint.length > before.length);

  await createMembership({ userId: buyerId, vertical: "FOOD", role: "CLIENT" });
  const afterDouble = await getMemberships(buyerId);
  assert(
    "double commitment is idempotent (upsert, not a duplicate row)",
    afterDouble.filter((m) => m.vertical === "FOOD" && m.role === "CLIENT").length === 1,
    afterDouble,
  );

  // ==========================================================================
  section("Seller: (FOOD, PROVIDER)");
  // ==========================================================================
  await createMembership({ userId: sellerId, vertical: "FOOD", role: "PROVIDER" });
  const sellerMemberships = await getMemberships(sellerId);
  assert(
    "(FOOD, PROVIDER) round-trips",
    sellerMemberships.some((m) => m.vertical === "FOOD" && m.role === "PROVIDER" && m.status === "ACTIVE"),
    sellerMemberships,
  );
  assert("isFoodSeller() agrees", await isFoodSeller(sellerId), sellerMemberships);
  assert("…and is false for the buyer", !(await isFoodSeller(buyerId)));

  // ==========================================================================
  section("Scope containment — the whole point of APP_VERTICAL_SCOPE");
  // ==========================================================================
  // Two INDEPENDENT gates: the zod enum says a vertical value EXISTS, while
  // APP_VERTICAL_SCOPE says a given caller may WRITE it. SALON and APPAREL are
  // both valid enum values, so a 401 here can only come from the scope check.
  assert("food-app writing SALON is rejected 401", (await rawCreateMembership({ userId: buyerId, vertical: "SALON", role: "CLIENT" })) === 401);
  assert("food-app writing APPAREL is rejected 401", (await rawCreateMembership({ userId: buyerId, vertical: "APPAREL", role: "CLIENT" })) === 401);
  assert("food-app writing DEMIA is rejected 401", (await rawCreateMembership({ userId: buyerId, vertical: "DEMIA", role: "CLIENT" })) === 401);
  // …and a value that isn't in the enum at all fails at validation instead,
  // which is a different gate and a different status.
  const bogus = await rawCreateMembership({ userId: buyerId, vertical: "NOT_A_VERTICAL", role: "CLIENT" });
  assert("a non-existent vertical fails validation (422/400), not the scope gate", bogus === 422 || bogus === 400, bogus);

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
