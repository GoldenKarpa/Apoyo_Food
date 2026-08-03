/**
 * Slice 14's done-when, driven for real: "a PENDING seller creates a listing
 * with photos + 2 window types; availability computation passes tests;
 * listing renders on the Phase-1 detail page once the seller is (manually,
 * for now) flipped to ACTIVE."
 *
 * "Availability computation passes tests" is `lib/availability.test.ts`
 * (vitest, 27/27) — a claim about a pure function, proven there. Everything
 * else in that sentence is a claim about a rendered page and a real session,
 * which is what this script drives:
 *   - the listing/photo/window Server Actions cannot be called from a plain
 *     Node script (`next/headers` throws outside a request scope — Slices
 *     10/11/13's same limitation), so this is the ONLY way to exercise them;
 *   - "renders on the Phase-1 detail page" is a claim about `/meals/[slug]`
 *     showing what was actually configured, not merely returning 200.
 *
 * ⚠ Run against a PRODUCTION build (`npm run build && npm start`) — see
 * `verify-onboarding.mjs`'s own note for why (`__Secure-` cookie naming, the
 * Chromium cookie-acceptance finding reused here verbatim).
 *
 * This script creates its seller row DIRECTLY via Prisma rather than walking
 * the Slice 13 onboarding UI — that flow is already proven end to end
 * (`verify-onboarding.mjs`, 66/66); re-driving it here would test Slice 13
 * again, not Slice 14.
 *
 *   node scripts/verify-listing-editor.mjs [--base http://localhost:3012]
 */

import { createRequire } from "node:module";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import sharp from "sharp";

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
const OWNER_USER_ID = "food-s14-owner";
const INTRUDER_USER_ID = "food-s14-intruder";
const OWNER_SLUG = "_verify-s14-owner";
const INTRUDER_SLUG = "_verify-s14-intruder";
const LISTING_TITLE = "Pastelón de Plátano Maduro";
const LISTING_SLUG_PREFIX = "pastelon-de-platano-maduro";

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

async function jpegFixture(color) {
  return sharp({ create: { width: 900, height: 900, channels: 3, background: color } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function mintCookie(userId, locale = "es") {
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
      role: "CLIENT",
      isGuest: false,
      locale,
      originSubdomain: "portal",
      memberships: [],
      emailVerified: true,
    },
  });
  // See verify-onboarding.mjs's own note: `{ domain, path, secure }`, not
  // `{ url, secure: true }` — Chromium's CDP rejects a `__Secure-` cookie
  // handed an http:// URL outright.
  return { name, value, domain: new URL(BASE).hostname, path: "/", secure: true, sameSite: "Lax" };
}

async function resetFixtures() {
  await prisma.foodListingPhoto.deleteMany({ where: { listing: { seller: { userId: { in: [OWNER_USER_ID, INTRUDER_USER_ID] } } } } });
  await prisma.foodAvailabilityWindow.deleteMany({ where: { listing: { seller: { userId: { in: [OWNER_USER_ID, INTRUDER_USER_ID] } } } } });
  await prisma.foodListingCategory.deleteMany({ where: { listing: { seller: { userId: { in: [OWNER_USER_ID, INTRUDER_USER_ID] } } } } });
  await prisma.foodListing.deleteMany({ where: { seller: { userId: { in: [OWNER_USER_ID, INTRUDER_USER_ID] } } } });
  await prisma.foodSellerPhoto.deleteMany({ where: { seller: { userId: { in: [OWNER_USER_ID, INTRUDER_USER_ID] } } } });
  await prisma.foodSeller.deleteMany({ where: { userId: { in: [OWNER_USER_ID, INTRUDER_USER_ID] } } });
}

async function run() {
  await resetFixtures();

  const owner = await prisma.foodSeller.create({
    data: { userId: OWNER_USER_ID, slug: OWNER_SLUG, displayName: "Verify Slice 14 Kitchen", status: "PENDING" },
  });
  const intruder = await prisma.foodSeller.create({
    data: { userId: INTRUDER_USER_ID, slug: INTRUDER_SLUG, displayName: "Verify Slice 14 Intruder", status: "ACTIVE" },
  });
  check(owner.status === "PENDING", "setup: the owning seller starts PENDING, matching the done-when's own wording");

  const categories = await prisma.foodCategory.findMany({ select: { id: true, slug: true }, orderBy: { sortOrder: "asc" } });
  const dessertsCategory = categories.find((c) => c.slug === "desserts");
  check(!!dessertsCategory, "setup: the seeded taxonomy has a 'desserts' category");

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([await mintCookie(OWNER_USER_ID)]);
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // ==========================================================================
  section("Create — the base form");
  // ==========================================================================
  await page.goto(`${BASE}/food/listings/new`, { waitUntil: "networkidle" });
  await page.getByLabel("Nombre del plato").fill(LISTING_TITLE);
  await page.getByLabel("Descripción").fill("Capas de plátano maduro dulce, horneado en casa, receta de familia.");
  // priceMode defaults to FIXED (PRICE_MODES[0]) — fill the price that reveals.
  await page.getByLabel("Monto").fill("55.00");
  await page.getByLabel("¿Para cuántas personas alcanza?").fill("6");
  if (dessertsCategory) {
    await page.getByRole("button", { name: /Postres/ }).click();
  }
  // `exact: true` — "Vegetariano" is also a SUBSTRING of the "Vegetariano y
  // vegano" CATEGORY chip on this same form, which a loose match resolves
  // ambiguously to both.
  await page.getByRole("button", { name: "Vegetariano", exact: true }).click(); // a dietary toggle chip
  await page.getByLabel("Ingredientes").fill("plátano maduro");
  await page.getByLabel("Ingredientes").press("Enter"); // Enter adds the chip, not the surrounding form

  await page.getByRole("button", { name: "Crear plato" }).click();
  // ⚠ `{10,}` matters: a bare `[a-z0-9]+$` also matches the STARTING page,
  // `/food/listings/new` — "new" is itself lowercase-alphanumeric — so
  // `waitForURL` resolved on the pre-submit URL instantly, before the real
  // navigation happened, and the DB check below raced ahead of the write.
  // cuids are 25 characters; requiring 10+ excludes "new" outright.
  await page.waitForURL(/\/food\/listings\/[a-z0-9]{10,}$/i, { timeout: 15000 });

  const created = await prisma.foodListing.findFirst({ where: { sellerId: owner.id } });
  check(created !== null, "a FoodListing row now exists, owned by the PENDING seller");
  check(created?.title === LISTING_TITLE, "…with the title verbatim, accents intact", created?.title);
  check(!!created?.slug?.startsWith(LISTING_SLUG_PREFIX), "…and an accent-folded slug", created?.slug);
  check(created?.priceCents === 5500, "…the price converted to cents correctly (55.00 -> 5500)", created?.priceCents);
  check(created?.active === true, "…active by default (schema default, no toggle required to publish)");
  const withCategory = await prisma.foodListingCategory.count({ where: { listingId: created.id } });
  check(dessertsCategory ? withCategory === 1 : true, "…the chosen category was saved");

  const listingId = created.id;

  // ==========================================================================
  section("Photos — hero-first, through the real pipeline");
  // ==========================================================================
  const photoA = await jpegFixture({ r: 210, g: 160, b: 90 });
  const photoB = await jpegFixture({ r: 90, g: 60, b: 40 });

  await page.setInputFiles("#listing-photo-file", { name: "plate.jpg", mimeType: "image/jpeg", buffer: photoA });
  await page.waitForTimeout(2000);
  await page.setInputFiles("#listing-photo-file", { name: "slice.jpg", mimeType: "image/jpeg", buffer: photoB });
  await page.waitForTimeout(2000);

  const photos = await prisma.foodListingPhoto.findMany({
    where: { listingId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  check(photos.length === 2, "both photos landed as FoodListingPhoto rows", photos.length);
  check(
    photos.every((p) => p.pathThumb.startsWith("listings/") && p.pathThumb.endsWith("-thumb.webp")),
    "…as pipeline storage keys (listings/<id>-thumb.webp), not raw uploads",
  );
  const heroChip = await page.getByText("Principal").count();
  check(heroChip === 1, "exactly one photo is labelled the hero, and it's the first uploaded");

  // ==========================================================================
  section("Availability — two window types, the done-when's own phrase");
  // ==========================================================================
  // Window 1: RECURRING_WEEKLY, weekdays — clicked by INDEX (0=Sun..6=Sat,
  // lib/availability.ts's own ordering), not by the Spanish 3-letter label
  // text, so this assertion doesn't depend on translation wording.
  //
  // ⚠ `<WeekdayPicker>` is a `<fieldset><legend>`, not a `<label>` — a
  // `<legend>` names the fieldset's implicit `role="group"` accessible name,
  // which `getByLabel` (built for `<label>`-associated form controls) does
  // not resolve at all. `getByRole("group", { name })` is the correct query.
  await page.getByRole("group", { name: "¿Qué días?" }).waitFor();
  const weekdayButtons = page.locator('fieldset:has-text("¿Qué días?") button');
  const dayCount = await weekdayButtons.count();
  check(dayCount === 7, "the weekday picker renders exactly 7 day toggles", dayCount);
  // Click Monday(1), Wednesday(3), Friday(5) — indices into the 7-button row.
  await weekdayButtons.nth(1).click();
  await weekdayButtons.nth(3).click();
  await weekdayButtons.nth(5).click();
  await page.getByRole("button", { name: "Añadir horario" }).click();
  await page.waitForTimeout(1500);

  let windows = await prisma.foodAvailabilityWindow.findMany({ where: { listingId } });
  check(windows.length === 1, "the first window (RECURRING_WEEKLY) was created", windows.length);
  check(windows[0]?.type === "RECURRING_WEEKLY" && windows[0]?.daysOfWeek === 42, "…Mon+Wed+Fri encoded as bitmask 42", windows[0]);

  // Window 2: PREORDER, 3-day lead time.
  await page.getByLabel("Tipo de horario").selectOption("PREORDER");
  await page.getByLabel("¿Con cuántos días de anticipación se pide?").fill("3");
  await page.getByRole("button", { name: "Añadir horario" }).click();
  await page.waitForTimeout(1500);

  windows = await prisma.foodAvailabilityWindow.findMany({ where: { listingId } });
  check(windows.length === 2, "…and the second window (PREORDER) was added alongside it — TWO window types, per the done-when", windows.length);
  const preorderWindow = windows.find((w) => w.type === "PREORDER");
  check(preorderWindow?.leadTimeDays === 3, "…the PREORDER window carries its lead time", preorderWindow);

  const summaryText = await page.locator("body").innerText();
  check(/Lun · Mié · Vie|lun · mié · vie/i.test(summaryText) || /Fin de semana|entre semana/i.test(summaryText), "the weekday window's human-readable summary renders", summaryText.slice(0, 40));
  check(/Por encargo/i.test(summaryText), "the pre-order window's human-readable summary renders");

  // ==========================================================================
  section("Visibility follows the SELLER's status, not just the listing's");
  // ==========================================================================
  const pendingPublicLink = await page.locator(`a[href="/meals/${created.slug}"]`).count();
  check(pendingPublicLink === 0, "with the seller still PENDING, no public link is offered on the edit page");
  const pendingMealPage = await page.request.get(`${BASE}/meals/${created.slug}`);
  check(pendingMealPage.status() === 404, "…and the listing 404s on the buyer surface while the seller is PENDING", pendingMealPage.status());

  // The done-when's own words: "manually, for now".
  await prisma.foodSeller.update({ where: { id: owner.id }, data: { status: "ACTIVE" } });

  await page.reload({ waitUntil: "networkidle" });
  const activePublicLink = await page.locator(`a[href="/meals/${created.slug}"]`).count();
  check(activePublicLink === 1, "…and once the seller is flipped ACTIVE, the edit page now offers the public link");

  // ==========================================================================
  section("Renders on the Phase-1 detail page — the done-when's own finish line");
  // ==========================================================================
  const mealPage = await page.request.get(`${BASE}/meals/${created.slug}`);
  check(mealPage.status() === 200, "the listing now renders at /meals/[slug]", mealPage.status());
  const mealHtml = await mealPage.text();
  check(mealHtml.includes(LISTING_TITLE), "…showing the title entered in the editor");
  check(mealHtml.includes("$55") && mealHtml.includes("TTD") && !mealHtml.includes("€"), "…the price in TTD, never €");
  check((mealHtml.match(/\/api\/media\/listings\//g) ?? []).length >= 2, "…both photos, served through the media pipeline's own route");
  // ⚠ English, not Spanish: a bare `page.request.get()` carries no locale
  // cookie, and the CLIENT surface (unlike the seller dashboard) defaults to
  // `en` (i18n/request.ts) — the buyer page genuinely renders "Pre-order",
  // regardless of the Spanish-language session used to CREATE the listing.
  check(/Pre-order/.test(mealHtml), "…the PREORDER window's stamp text");

  // ==========================================================================
  section("Editing an existing listing — the SAME action, no new code path");
  // ==========================================================================
  await page.goto(`${BASE}/food/listings/${listingId}`, { waitUntil: "networkidle" });
  const titleInput = page.getByLabel("Nombre del plato");
  await titleInput.fill(`${LISTING_TITLE} (actualizado)`);
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForTimeout(1200);
  const updated = await prisma.foodListing.findUnique({ where: { id: listingId } });
  check(updated?.title === `${LISTING_TITLE} (actualizado)`, "the title updated on Save");
  check(updated?.slug === created.slug, "…and the slug did NOT change — links already shared must keep working");

  // ==========================================================================
  section("The pause switch — the only 'delete' this product has");
  // ==========================================================================
  await page.getByRole("switch").first().click();
  await page.waitForTimeout(1200);
  const paused = await prisma.foodListing.findUnique({ where: { id: listingId }, select: { active: true } });
  check(paused?.active === false, "the active switch flips the row immediately, no Save required");
  const pausedMealPage = await page.request.get(`${BASE}/meals/${created.slug}`);
  check(pausedMealPage.status() === 404, "…and a paused listing 404s on the buyer surface even with an ACTIVE seller", pausedMealPage.status());
  // Restore for the rest of the run / a clean re-run.
  await page.getByRole("switch").first().click();
  await page.waitForTimeout(1200);

  // ==========================================================================
  section("Ownership — a second seller cannot reach or touch this listing");
  // ==========================================================================
  const intruderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await intruderContext.addCookies([await mintCookie(INTRUDER_USER_ID)]);
  const intruderPage = await intruderContext.newPage();

  const intruderEditPage = await intruderPage.goto(`${BASE}/food/listings/${listingId}`, { waitUntil: "networkidle" });
  check(intruderEditPage.status() === 404, "a DIFFERENT seller visiting the edit URL directly gets a 404, not someone else's dish", intruderEditPage.status());

  const intruderUpload = await intruderPage.request.post(`${BASE}/api/seller/listing-media`, {
    multipart: { listingId, file: { name: "x.jpg", mimeType: "image/jpeg", buffer: photoA } },
  });
  check(intruderUpload.status() === 401, "…and cannot upload a photo onto it via the API either", intruderUpload.status());
  const untouchedPhotoCount = await prisma.foodListingPhoto.count({ where: { listingId } });
  check(untouchedPhotoCount === 2, "…the listing's own photo count is unchanged");
  await intruderContext.close();

  void intruder; // created for completeness; the intruder's OWN session is what's exercised above

  // ==========================================================================
  section("Mobile layout on the listing editor (390px)");
  // ==========================================================================
  for (const route of ["/food/listings", "/food/listings/new", `/food/listings/${listingId}`]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, `${route}: no horizontal overflow at 390px`, overflow);
  }

  check(consoleErrors.length === 0, "zero console/page errors across the whole flow", consoleErrors.slice(0, 3));

  await context.close();
  await browser.close();

  await resetFixtures();
  const leftover = await prisma.foodSeller.count({ where: { userId: { in: [OWNER_USER_ID, INTRUDER_USER_ID] } } });
  check(leftover === 0, "self-cleaning: both test sellers are removed");

  console.log(`\n${pass} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
