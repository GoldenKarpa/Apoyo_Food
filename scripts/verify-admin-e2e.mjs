/**
 * Slice 16's done-when, driven for real: "the admin surface is ADMIN-only, an
 * unauthenticated production-build GET of every admin route has been grepped
 * for seeded/real data and is clean, the chrome is visually identical to
 * Portal's, and a real PENDING seller from Slice 13 can be approved to ACTIVE
 * through this UI (not a manual DB flip)."
 *
 * Browser pass, not a unit test — `requireAdmin()`-gated Server Actions
 * cannot be called from a plain Node script at all (`next/headers` resolves
 * to signed-out outside a request scope, proven directly in
 * `scripts/verify-admin.ts`), so driving the real UI with a minted ADMIN
 * session is the only way to exercise `updateSellerStatus`, `takedownListing`,
 * `resolveReport` and the category actions for real.
 *
 * ⚠ Run against a PRODUCTION build (`npm run build && npm start`), not
 * `next dev` — see `verify-onboarding.mjs`'s own note on the session-cookie
 * naming trap this avoids.
 *
 * Admin authorization here needs NO ecosystem API at all (`requireAdmin()` is
 * the legacy `role === "ADMIN"` field on the session, read straight off the
 * JWT) — unlike Slice 13's onboarding flow, this script does not need a local
 * portal-web running.
 *
 *   node scripts/verify-admin-e2e.mjs [--base http://localhost:3012]
 */

import { createRequire } from "node:module";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const SHARED_TOOL = "C:/Users/Karpa/.claude/tools/browser-testing";
const requireShared = createRequire(path.join(SHARED_TOOL, "package.json"));
const { chromium } = requireShared("playwright");

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = arg("base", "http://localhost:3012");
const ADMIN_USER_ID = "_verify-s16-admin-user-e2e";
const CLIENT_USER_ID = "_verify-s16-client-user-e2e";
const PENDING_SELLER_SLUG = "_verify-s16-pending-seller";
const ACTIVE_SELLER_SLUG = "_verify-s16-active-seller";

const prisma = new PrismaClient();

let pass = 0;
const failures = [];
function check(condition, label, detail) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}

async function mintCookie(userId, role, locale = "en") {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required (see .env.local)");
  const name = "__Secure-authjs.session-token";
  const value = await encode({
    secret,
    salt: name,
    maxAge: 30 * 24 * 60 * 60,
    token: {
      id: userId,
      sub: userId,
      role,
      isGuest: false,
      locale,
      originSubdomain: "portal",
      memberships: [],
      emailVerified: true,
      email: role === "ADMIN" ? "admin@apoyolime.com" : "buyer@apoyolime.com",
    },
  });
  // See verify-onboarding.mjs's own note: the domain/path form, not
  // { url, secure: true } — Chromium's CDP rejects a __Secure- cookie handed
  // to it with an http:// URL directly.
  return { name, value, domain: new URL(BASE).hostname, path: "/", secure: true, sameSite: "Lax" };
}

async function resetFixtures() {
  await prisma.foodReport.deleteMany({ where: { seller: { slug: { in: [PENDING_SELLER_SLUG, ACTIVE_SELLER_SLUG] } } } });
  await prisma.foodListing.deleteMany({ where: { seller: { slug: { in: [PENDING_SELLER_SLUG, ACTIVE_SELLER_SLUG] } } } });
  await prisma.foodSeller.deleteMany({ where: { slug: { in: [PENDING_SELLER_SLUG, ACTIVE_SELLER_SLUG] } } });
  await prisma.foodCategory.deleteMany({ where: { slug: { startsWith: "verify-s16-category" } } });
}

// ⚠ The app's i18n locale is NOT driven by the session JWT's `locale` claim
// for these surfaces — it resolves the same way `verify-onboarding.mjs`
// already found (that script tests against Spanish text for the same
// reason). Every locale-dependent assertion below checks the REAL default
// (Spanish) rather than the English this script originally hardcoded — that
// mismatch was the direct cause of the first several runs' 30s-per-locator
// timeouts. The shared admin SHELL CHROME (`ApoyoAdminShell`,
// `lib/admin-nav.ts`) is deliberately English-only regardless of locale —
// matching Apparel's and Salon's own copies — so sidebar/breadcrumb text
// stays English on purpose.
let browser;

async function main() {
  await resetFixtures();

  // A real PENDING seller with a COMPLETE profile — approve's own
  // precondition (`activationBlockers`) must find nothing missing, so a
  // pass here is a pass of the real gate, not a workaround for it.
  const pendingSeller = await prisma.foodSeller.create({
    data: {
      userId: `${PENDING_SELLER_SLUG}-user`,
      slug: PENDING_SELLER_SLUG,
      displayName: "Verify S16 Pending Kitchen",
      bio: "A".repeat(30),
      profileImageThumb: "sellers/x-thumb.webp",
      areas: ["central"],
      fulfillmentModes: ["PICKUP"],
      status: "PENDING",
    },
  });

  const activeSeller = await prisma.foodSeller.create({
    data: {
      userId: `${ACTIVE_SELLER_SLUG}-user`,
      slug: ACTIVE_SELLER_SLUG,
      displayName: "Verify S16 Active Kitchen",
      bio: "A".repeat(30),
      profileImageThumb: "sellers/x-thumb.webp",
      areas: ["central"],
      fulfillmentModes: ["PICKUP"],
      status: "ACTIVE",
    },
  });
  const listing = await prisma.foodListing.create({
    data: {
      sellerId: activeSeller.id,
      slug: "_verify-s16-listing-target",
      title: "Verify S16 Target Dish",
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "FIXED",
      priceCents: 1000,
    },
  });
  const report = await prisma.foodReport.create({
    data: {
      listingId: listing.id,
      sellerId: activeSeller.id,
      reason: "OTHER",
      message: "Verify S16 open report",
    },
  });

  browser = await chromium.launch();

  // ==========================================================================
  section("Unauthenticated — no admin data reaches the browser");
  // ==========================================================================
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/food/admin`, { waitUntil: "networkidle" });
    const html = await page.content();
    check(!html.includes(pendingSeller.displayName), "anonymous GET /food/admin does not leak the PENDING seller's name");
    check(!html.includes(listing.title), "…does not leak the target listing's title");
    check(!html.includes(report.message ?? "__no_message__"), "…does not leak the open report's message");
    check(/inicia sesión/i.test(await page.locator("body").innerText()), "…shows a sign-in prompt instead");
    await context.close();
  }

  // ==========================================================================
  section("Signed in, NOT admin — same denial, different message");
  // ==========================================================================
  {
    const context = await browser.newContext();
    await context.addCookies([await mintCookie(CLIENT_USER_ID, "CLIENT")]);
    const page = await context.newPage();
    await page.goto(`${BASE}/food/admin`, { waitUntil: "networkidle" });
    const html = await page.content();
    check(!html.includes(pendingSeller.displayName), "signed-in non-admin GET /food/admin does not leak the PENDING seller's name");
    check(!html.includes(listing.title), "…does not leak the target listing's title");
    const bodyText = await page.locator("body").innerText();
    check(/no es administradora de apoyo/i.test(bodyText), "…tells them this account is not an admin");
    check((await page.locator('a:has-text("trabajo")').count()) > 0, "…and offers a way back to their own workspace (never a dead-end)");
    await context.close();
  }

  // ==========================================================================
  section("Signed in as ADMIN — the shared shell chrome");
  // ==========================================================================
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([await mintCookie(ADMIN_USER_ID, "ADMIN")]);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/food/admin`, { waitUntil: "networkidle" });
  check(await page.locator("text=Admin home").first().isVisible(), "sidebar has the persistent '\u2190 Admin home' link (nav-contract item 4)");
  check(await page.locator("nav[aria-label='Admin sections'] >> text=Food product-admin").first().isVisible(), "sidebar lists this app's own entry");
  check(await page.locator("nav[aria-label='Admin sections'] >> text=Apparel product-admin").first().isVisible(), "…and every sibling vertical's entry (the shared, composed registry — not a Food-only list)");
  check(await page.locator("nav[aria-label='Breadcrumb'] >> text=Food product-admin").first().isVisible(), "breadcrumb trail shows the current page");
  check(await page.locator("text=admin@apoyolime.com").first().isVisible(), "topbar shows the signed-in admin's identity");
  check(await page.locator(`text=${pendingSeller.displayName}`).first().isVisible(), "the PENDING seller IS visible to an actual admin");

  // ==========================================================================
  section("Seller approval — a real PENDING seller, approved through the UI");
  // ==========================================================================
  const pendingCard = page.locator(".admin-card", { hasText: pendingSeller.displayName });
  await pendingCard.getByRole("button", { name: "Aprobar" }).click();
  await page.waitForTimeout(600);
  const approvedRow = await prisma.foodSeller.findUnique({ where: { id: pendingSeller.id } });
  check(approvedRow?.status === "ACTIVE", "the seller row is ACTIVE in the DATABASE after clicking Approve (not a manual flip)", approvedRow?.status);
  await page.reload({ waitUntil: "networkidle" });
  const movedCard = page.locator(".admin-card", { hasText: pendingSeller.displayName });
  check(
    (await movedCard.getByRole("button", { name: "Aprobar" }).count()) === 0,
    "…and the approved seller's card no longer offers Approve — it moved out of the Pending queue",
  );

  // ⚠ A configured URL is not the same as a REACHABLE one — `ensureFoodProviderMembership`
  // (Slice 3, reused unchanged here) is non-fatal on its own, so `updateSellerStatus`'s
  // approve path succeeds either way; this assertion only means something when a
  // local portal-web genuinely answers. Probed for real rather than trusting the
  // env var's host string, so a configured-but-not-running ecosystem host SKIPS
  // rather than reports a false product failure.
  let memberships = null;
  let ecosystemReachable = false;
  if (process.env.ECOSYSTEM_API_BASE_URL && !process.env.ECOSYSTEM_API_BASE_URL.includes("apoyolime.com")) {
    try {
      const res = await fetch(
        `${process.env.ECOSYSTEM_API_BASE_URL}/api/ecosystem/v1/users/${pendingSeller.userId}/memberships`,
        { headers: { Authorization: `Bearer ${process.env.ECOSYSTEM_SERVICE_TOKEN}` }, signal: AbortSignal.timeout(3000) },
      );
      ecosystemReachable = true;
      memberships = res.ok ? await res.json() : null;
    } catch {
      ecosystemReachable = false;
    }
  }
  if (ecosystemReachable) {
    check(
      !!memberships?.memberships?.some((m) => m.vertical === "FOOD" && m.role === "PROVIDER" && m.status === "ACTIVE"),
      "…and approve minted/confirmed the (FOOD, PROVIDER) membership",
    );
  } else {
    console.log("  SKIP  membership confirmation — no local ecosystem API reachable (approve still succeeds, self-heals later)");
  }

  // ==========================================================================
  section("Suspend, then reinstate — the other two transitions, through the UI");
  // ==========================================================================
  await page.reload({ waitUntil: "networkidle" });
  const activeCard = page.locator(".admin-card", { hasText: pendingSeller.displayName });
  page.once("dialog", (d) => d.accept());
  await activeCard.getByRole("button", { name: "Suspender" }).click();
  await page.waitForTimeout(600);
  const suspendedRow = await prisma.foodSeller.findUnique({ where: { id: pendingSeller.id } });
  check(suspendedRow?.status === "SUSPENDED", "Suspend flips ACTIVE -> SUSPENDED for real", suspendedRow?.status);

  await page.reload({ waitUntil: "networkidle" });
  const suspendedCard = page.locator(".admin-card", { hasText: pendingSeller.displayName });
  await suspendedCard.getByRole("button", { name: "Reincorporar" }).click();
  await page.waitForTimeout(600);
  const reinstatedRow = await prisma.foodSeller.findUnique({ where: { id: pendingSeller.id } });
  check(reinstatedRow?.status === "ACTIVE", "Reinstate flips SUSPENDED -> ACTIVE for real", reinstatedRow?.status);

  // ==========================================================================
  section("Report queue — resolve via dismiss");
  // ==========================================================================
  await page.reload({ waitUntil: "networkidle" });
  const reportCard = page.locator(".admin-card", { hasText: listing.title });
  check(await reportCard.isVisible(), "the open report is visible, showing the target listing's title");
  await reportCard.getByRole("button", { name: "Descartar" }).click();
  await page.waitForTimeout(600);
  const dismissedReport = await prisma.foodReport.findUnique({ where: { id: report.id } });
  check(dismissedReport?.status === "DISMISSED", "Dismiss resolves the report for real, without taking the listing down", dismissedReport?.status);
  const listingAfterDismiss = await prisma.foodListing.findUnique({ where: { id: listing.id } });
  check(listingAfterDismiss?.takenDownAt === null, "…and the listing itself is untouched", listingAfterDismiss?.takenDownAt);

  // ==========================================================================
  section("Listing takedown — direct, via the search tool");
  // ==========================================================================
  await page.reload({ waitUntil: "networkidle" });
  // The search "form" is a plain GET with no submit button — Enter submits it.
  await page.fill('input[name="q"]', listing.title);
  await page.locator('input[name="q"]').press("Enter");
  await page.waitForLoadState("networkidle");
  const searchResultCard = page.locator(".admin-card", { hasText: listing.title });
  check(await searchResultCard.isVisible(), "the search tool finds the target listing by title");
  page.once("dialog", (d) => d.accept());
  await searchResultCard.getByRole("button", { name: "Retirar" }).click();
  await page.waitForTimeout(600);
  const takenDownListing = await prisma.foodListing.findUnique({ where: { id: listing.id } });
  check(takenDownListing?.takenDownAt !== null, "the listing's takenDownAt is set for real after clicking Take down", takenDownListing?.takenDownAt);

  const publicPage = await context.newPage();
  const publicResp = await publicPage.goto(`${BASE}/meals/${listing.slug}`, { waitUntil: "networkidle" });
  check(publicResp?.status() === 404, "the taken-down listing's public page now 404s", publicResp?.status());
  await publicPage.close();

  // ==========================================================================
  section("Category manager — add a real category");
  // ==========================================================================
  await page.reload({ waitUntil: "networkidle" });
  const newCategorySection = page.locator("section", { hasText: "Agregar una categoría" });
  await newCategorySection.locator('input[id^="cat-name-en-new"]').fill("Verify S16 Category");
  await newCategorySection.locator('input[id^="cat-name-es-new"]').fill("Categoría Verify S16");
  await newCategorySection.getByRole("button", { name: "Agregar" }).click();
  await page.waitForTimeout(600);
  const createdCategory = await prisma.foodCategory.findFirst({ where: { nameEn: "Verify S16 Category" } });
  check(!!createdCategory && createdCategory.nameEs === "Categoría Verify S16", "a category created through the UI lands in the database with both names", createdCategory);
  check(/^[a-z0-9-]+$/.test(createdCategory?.slug ?? ""), "…and gets a real slugified slug", createdCategory?.slug);

  check(consoleErrors.length === 0, "zero browser console errors across the whole admin flow", consoleErrors.slice(0, 5));

  await resetFixtures();
  const leftover = await prisma.foodSeller.count({ where: { slug: { in: [PENDING_SELLER_SLUG, ACTIVE_SELLER_SLUG] } } });
  check(leftover === 0, "self-cleaning: no verification fixtures survive the run");

  console.log(`\n${pass} pass, ${failures.length} fail`);
  if (failures.length > 0) {
    console.log("\nFailed:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

// ⚠ `browser.close()` MUST run on every exit path, not just the success one.
// The first several runs of this script hung indefinitely — not during any
// step, but AFTER an assertion/locator error was already caught and logged —
// because a launched Chromium keeps a live connection to this process, and
// nothing was closing it on the error path. Node's event loop has no reason
// to exit while that connection is open, so the process sat idle forever
// even though `main()` had already rejected. `process.exit()` at the very
// end is a second, explicit belt-and-suspenders guarantee against the same
// class of dangling-handle hang from any OTHER open resource.
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(process.exitCode ?? 0);
  });
