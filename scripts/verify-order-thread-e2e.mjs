/**
 * Slice 18's done-when, driven for real: "a full bilingual order-thread
 * conversation round-trips with correct translations shown gently (original
 * prominent, translation smaller/lighter beneath); email fan-out fires
 * idempotently; the translate-service-down degrade path still delivers
 * original text."
 *
 * Browser pass, not a unit test — `sendOrderMessage`/`reportOrderMessage` are
 * Server Actions and cannot be called from a plain Node script outside a
 * request scope (the same limitation every prior slice's own e2e script has
 * documented). The debounce/idempotency MECHANISM is proven directly and
 * separately in `scripts/verify-order-thread.ts` (`notifyOrderMessage` has no
 * `next/headers` dependency, so it's callable there against a real database);
 * this script's own contribution is the real, rendered, cross-account
 * conversation, the attachment round-trip, and the polling refresh actually
 * updating an already-open page with no manual reload.
 *
 * ⚠ Run against a PRODUCTION build (`npm run build && npm start`) — see
 * `verify-onboarding.mjs`'s own note (`__Secure-` cookie naming, forced
 * `NODE_ENV=production`).
 *
 * The translate service is unreachable in this dev environment by its own
 * design (`lib/translate.ts`'s own header comment) — the SAME ambient state
 * every prior slice's translation-adjacent verification has relied on, not
 * something staged for this run. Every message sent here therefore proves the
 * degrade path live: no translation line ever appears, and the original is
 * always what both sides see.
 *
 *   node scripts/verify-order-thread-e2e.mjs [--base http://localhost:3012]
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
const SLUG = "_verify-s18-thread-e2e";
const SELLER_USER_ID = `${SLUG}-seller`;
const BUYER_USER_ID = `${SLUG}-buyer`;

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
    token: { id: userId, sub: userId, role, isGuest: false, locale, originSubdomain: "portal", memberships: [], emailVerified: true },
  });
  return { name, value, domain: new URL(BASE).hostname, path: "/", secure: true, sameSite: "Lax" };
}

async function resetFixtures() {
  await prisma.foodNotification.deleteMany({ where: { userId: { in: [SELLER_USER_ID, BUYER_USER_ID] } } });
  await prisma.foodReport.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodOrder.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodListing.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodSeller.deleteMany({ where: { userId: SELLER_USER_ID } });
}

let browser;

async function main() {
  await resetFixtures();

  const seller = await prisma.foodSeller.create({
    data: {
      userId: SELLER_USER_ID,
      slug: SLUG,
      displayName: "Verify S18 Kitchen",
      bio: "A".repeat(30),
      areas: ["central"],
      fulfillmentModes: ["PICKUP"],
      status: "ACTIVE",
      // Nothing renders this to a browser without the real (unreachable here)
      // SMTP relay actually delivering — this script proves the THREAD, not
      // inbox delivery. Set anyway so `notifyOrderMessage`'s email attempt
      // path runs (and fails silently) exactly as it will in production.
      email: "verify-s18-seller@example.test",
      languages: ["es"],
    },
  });
  const listing = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: `${SLUG}-dish`,
      title: "Verify Thread Dish",
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "FIXED",
      priceCents: 2000,
    },
  });
  // Created directly as ACCEPTED — the full place->accept walk is already
  // proven end to end by Slice 17's own `verify-order-lifecycle.mjs`;
  // re-driving it here would test Slice 17 again, not Slice 18.
  const order = await prisma.foodOrder.create({
    data: {
      orderNumber: "FD-S18E2E",
      clientId: BUYER_USER_ID,
      clientEmail: "verify-s18-buyer@example.test",
      sellerId: seller.id,
      status: "ACCEPTED",
      fulfillmentMode: "PICKUP",
      fulfillmentAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      respondBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
      subtotalCents: 2000,
      acceptedAt: new Date(),
      items: { create: { listingId: listing.id, titleSnapshot: listing.title, priceCentsSnapshot: 2000, quantity: 1 } },
    },
    select: { id: true, orderNumber: true },
  });

  browser = await chromium.launch();
  const consoleErrors = [];
  function trackConsole(page) {
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
  }

  const buyerContext = await browser.newContext();
  await buyerContext.addCookies([await mintCookie(BUYER_USER_ID, "CLIENT")]);
  const buyerPage = await buyerContext.newPage();
  trackConsole(buyerPage);

  const sellerContext = await browser.newContext();
  await sellerContext.addCookies([await mintCookie(SELLER_USER_ID, "CLIENT")]);
  const sellerPage = await sellerContext.newPage();
  trackConsole(sellerPage);

  // ==========================================================================
  section("Buyer sends the opening message — real round trip, degrade path live");
  // ==========================================================================
  await buyerPage.goto(`${BASE}/orders/${order.id}`, { waitUntil: "networkidle" });
  await buyerPage.getByPlaceholder("Write a message…").fill("What time will it be ready?");
  await buyerPage.getByRole("button", { name: "Send" }).click();
  await buyerPage.waitForTimeout(800);

  const firstMessage = await prisma.foodOrderMessage.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
  check(firstMessage.originalText === "What time will it be ready?", "the message stored its real text", firstMessage.originalText);
  check(firstMessage.originalLocale === "en", "…tagged with the buyer surface's own locale", firstMessage.originalLocale);
  check(
    Object.keys(firstMessage.translations ?? {}).length === 0,
    "…and translations is empty — the REAL translate service is unreachable in this environment, so this is the live degrade path, not a mock",
    firstMessage.translations,
  );

  await buyerPage.reload({ waitUntil: "networkidle" });
  const buyerThreadText = await buyerPage.locator("body").innerText();
  check(buyerThreadText.includes("What time will it be ready?"), "the buyer sees their own message rendered");
  check(
    (await buyerPage.locator("li").filter({ hasText: "What time will it be ready?" }).count()) > 0,
    "…inside a real thread bubble",
  );

  // ==========================================================================
  section("Seller sees it, and replies — cross-account, both surfaces degrade the same way");
  // ==========================================================================
  await sellerPage.goto(`${BASE}/food/orders/${order.id}`, { waitUntil: "networkidle" });
  const sellerThreadTextBefore = await sellerPage.locator("body").innerText();
  check(
    sellerThreadTextBefore.includes("What time will it be ready?"),
    "the seller sees the buyer's ORIGINAL English text — no translation exists (service down), so the degrade shows real words, never an error",
  );

  await sellerPage.getByPlaceholder("Escribe un mensaje…").fill("Estará listo a las 3pm");
  await sellerPage.getByRole("button", { name: "Enviar" }).click();
  await sellerPage.waitForTimeout(800);

  const messages = await prisma.foodOrderMessage.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
  check(messages.length === 2, "two real messages now exist", messages.length);
  check(messages[1].originalLocale === "es", "the seller's reply is tagged with the seller surface's own locale", messages[1].originalLocale);

  await buyerPage.reload({ waitUntil: "networkidle" });
  const buyerThreadTextAfter = await buyerPage.locator("body").innerText();
  check(buyerThreadTextAfter.includes("Estará listo a las 3pm"), "the buyer sees the seller's reply, original Spanish text (degrade path again)");

  // ==========================================================================
  section("Photo attachment — the Slice 4 pipeline, end to end through the thread");
  // ==========================================================================
  const sharp = (await import("sharp")).default;
  const fixtureBuffer = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 220, g: 160, b: 90 } } })
    .jpeg({ quality: 80 })
    .toBuffer();

  await buyerPage.setInputFiles('input[type="file"]', {
    name: "reference.jpg",
    mimeType: "image/jpeg",
    buffer: fixtureBuffer,
  });
  // Wait for the upload (ingest pipeline: validate -> sharp variants ->
  // storage) to finish before sending with no caption at all — a photo-only
  // message is a real case, and the Send button only enables once `attachment`
  // is set.
  await buyerPage.waitForTimeout(3000);
  await buyerPage.getByRole("button", { name: "Send" }).click();
  await buyerPage.waitForTimeout(800);

  const withAttachment = await prisma.foodOrderMessage.findFirst({
    where: { orderId: order.id, attachmentPath: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  check(!!withAttachment, "a message with a real stored attachment key now exists", withAttachment?.attachmentPath);
  check(withAttachment?.attachmentPath?.includes("orders") ?? false, "…in the orders/ category", withAttachment?.attachmentPath);
  check(withAttachment?.attachmentKind === "PHOTO", "…tagged PHOTO");

  await buyerPage.reload({ waitUntil: "networkidle" });
  const attachmentImgCount = await buyerPage
    .locator('img[src*="/api/media/orders/"]')
    .count()
    .catch(() => 0);
  check(attachmentImgCount > 0, "…and the photo actually RENDERS in the thread, through the real media route", attachmentImgCount);

  // ==========================================================================
  section("Polling refresh — an already-open page picks up a new message with no manual reload");
  // ==========================================================================
  await buyerPage.goto(`${BASE}/orders/${order.id}`, { waitUntil: "networkidle" });
  const beforePoll = await buyerPage.locator("body").innerText();
  check(!beforePoll.includes("Llegando en camino"), "sanity: the poll-test message doesn't exist yet");

  await sellerPage.goto(`${BASE}/food/orders/${order.id}`, { waitUntil: "networkidle" });
  await sellerPage.getByPlaceholder("Escribe un mensaje…").fill("Llegando en camino");
  await sellerPage.getByRole("button", { name: "Enviar" }).click();
  await sellerPage.waitForTimeout(600);

  // The poller ticks every 8s (`<OrderThreadPoller>`'s own default) — wait
  // past that WITHOUT touching buyerPage at all, then read its CURRENT DOM.
  await buyerPage.waitForTimeout(9000);
  const afterPoll = await buyerPage.locator("body").innerText();
  check(afterPoll.includes("Llegando en camino"), "the buyer's already-open page shows the new message with zero manual interaction — the poller works");

  // ==========================================================================
  section("Reporting hook — message content reaches the Slice 16 admin flag list");
  // ==========================================================================
  await buyerPage.reload({ waitUntil: "networkidle" });
  const reportTrigger = buyerPage.locator('button[aria-label="Report this message"]').first();
  await reportTrigger.click({ force: true });
  await buyerPage.waitForSelector('[role="dialog"]', { state: "visible" });
  await buyerPage.getByLabel("Details (optional)").fill("This looks off");
  await buyerPage.getByRole("button", { name: "Submit report" }).click();
  await buyerPage.waitForTimeout(600);

  const report = await prisma.foodReport.findFirst({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
  check(!!report, "a real FoodReport row was created");
  check(report?.reporterUserId === BUYER_USER_ID, "…attributed to the real reporter", report?.reporterUserId);
  check(report?.message?.includes(order.orderNumber) ?? false, "…and the order number is embedded so an admin can trace it", report?.message);
  check(report?.message?.includes("This looks off") ?? false, "…along with the reporter's own detail");

  check(consoleErrors.length === 0, "zero browser console errors across the whole thread flow", consoleErrors.slice(0, 5));

  await resetFixtures();
  const leftover = await prisma.foodSeller.count({ where: { userId: SELLER_USER_ID } });
  check(leftover === 0, "self-cleaning: no verification fixtures survive the run", leftover);

  console.log(`\n${pass} pass, ${failures.length} fail`);
  if (failures.length > 0) {
    console.log("\nFailed:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

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
