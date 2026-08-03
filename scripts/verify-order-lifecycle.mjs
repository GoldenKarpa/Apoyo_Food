/**
 * Slice 17's done-when, driven for real: "two real (ACTIVE, Slice 16-approved)
 * users run place->accept->complete and place->expire paths; invalid
 * transitions rejected; availability validation blocks out-of-window
 * requests; the Phase-1 ComingSoon stub is gone from the listing page."
 *
 * Browser pass, not a unit test — `createOrderRequest`/`acceptOrder`/
 * `declineOrder`/`completeOrder`/`cancelOrder` are all Server Actions and
 * cannot be called from a plain Node script outside a request scope (the
 * same limitation every prior slice's own e2e script has documented), so
 * driving the real UI with minted sessions is the only way to exercise them.
 * The exhaustive (action, status, actor) matrix is proven directly and
 * separately in `scripts/verify-orders.ts` — "invalid transitions rejected"
 * is covered THERE at the domain layer; this script's own contribution to
 * that claim is that the UI never even OFFERS an invalid action (checked on
 * the COMPLETED order below).
 *
 * ⚠ Run against a PRODUCTION build (`npm run build && npm start`) — see
 * `verify-onboarding.mjs`'s own note (`__Secure-` cookie naming, forced
 * `NODE_ENV=production`).
 *
 * Sellers/listings are created DIRECTLY via Prisma, not by walking Slice 13's
 * onboarding UI or Slice 16's admin approval queue — both are already proven
 * end to end by their own scripts; re-driving them here would test Slice
 * 13/16 again, not Slice 17 (the same call `verify-listing-editor.mjs` and
 * `verify-story-posting.mjs` made for their own fixtures).
 *
 *   node scripts/verify-order-lifecycle.mjs [--base http://localhost:3012]
 */

import { createRequire } from "node:module";
import path from "node:path";
import { execFileSync } from "node:child_process";

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
const SLUG = "_verify-s17-lifecycle";
const SELLER_USER_ID = `${SLUG}-seller`;
const BUYER_USER_ID = `${SLUG}-buyer`;
const ADMIN_USER_ID = `${SLUG}-admin`;

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
  await prisma.foodOrder.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodListing.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodSeller.deleteMany({ where: { userId: SELLER_USER_ID } });
}

/** Two calendar days out — safely future and safely clear of any UTC/Trinidad midnight-boundary ambiguity. */
function futureDateIso(daysAhead = 2) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function daysAgoIso(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

let browser;

async function main() {
  await resetFixtures();
  await prisma.foodPlatformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", orderingEnabled: false },
    update: { orderingEnabled: false },
  });

  const seller = await prisma.foodSeller.create({
    data: {
      userId: SELLER_USER_ID,
      slug: SLUG,
      displayName: "Verify S17 Kitchen",
      bio: "A".repeat(30),
      // ⚠ Deliberately NO profileImageThumb — this script's order pages
      // render `<ListingSellerRow>`'s avatar for real, and a placeholder path
      // with no actual file behind it (the shape other scripts use for
      // fixtures that never render it) would 404 through `<FoodImage>`'s
      // real media route. `avatar: null` renders the built-in placeholder
      // circle instead — a real, intended code path, not a workaround.
      areas: ["central"],
      fulfillmentModes: ["PICKUP"],
      status: "ACTIVE",
    },
  });

  const listingHappy = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: `${SLUG}-happy`,
      title: "Verify Happy Path Dish",
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "FIXED",
      priceCents: 2500,
      availabilityWindows: { create: { type: "RECURRING_WEEKLY", daysOfWeek: 127 } }, // every day
    },
  });
  const listingQuote = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: `${SLUG}-quote`,
      title: "Verify Quote Dish",
      description: "x",
      kind: "CUSTOM",
      priceMode: "QUOTE",
      availabilityWindows: { create: { type: "RECURRING_WEEKLY", daysOfWeek: 127 } },
    },
  });
  const listingOutOfWindow = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: `${SLUG}-out-of-window`,
      title: "Verify Out Of Window Dish",
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "FIXED",
      priceCents: 1000,
      // A DATE_RANGE fully in the past — no future date can ever fall inside it,
      // and calendar-date maths sidesteps any server/script timezone skew.
      availabilityWindows: { create: { type: "DATE_RANGE", startsOn: new Date(daysAgoIso(10)), endsOn: new Date(daysAgoIso(5)) } },
    },
  });

  browser = await chromium.launch();
  const consoleErrors = [];
  function trackConsole(page) {
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
  }

  /**
   * ⚠ A plain `.waitFor({state:"visible"})` on `[role="alert"]` proved flaky
   * here specifically — the element appears via a React state update inside a
   * Radix Dialog rather than being present from first paint, and Playwright's
   * own actionability wait occasionally missed it even though the underlying
   * `createOrderRequest` call (traced during debugging) resolved correctly in
   * well under 100ms. A short manual poll is more robust for this exact shape
   * (element appears late, short-lived relevance) than a single `waitFor`.
   */
  async function pollForAlertText(page, { attempts = 20, intervalMs = 500 } = {}) {
    for (let i = 0; i < attempts; i += 1) {
      const text = await page.locator('[role="alert"]').first().innerText().catch(() => "");
      if (text) return text;
      await page.waitForTimeout(intervalMs);
    }
    return "";
  }

  // ==========================================================================
  section("Default state — ordering PAUSED, the Custom Edit's own instruction");
  // ==========================================================================
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    trackConsole(page);
    await page.goto(`${BASE}/meals/${listingHappy.slug}`, { waitUntil: "networkidle" });

    check(
      (await page.locator('[data-coming-soon="requestOrder"]').count()) === 0,
      "the Phase-1 ComingSoon stub is GONE from the listing page",
    );

    await page.getByRole("button", { name: "Request order" }).click();
    await page.waitForSelector('[role="dialog"]', { state: "visible" });
    const pausedText = await page.locator('[role="dialog"]').innerText();
    check(/isn't open yet/i.test(pausedText), "anonymous + PAUSED: the sheet shows the launch-gate notice, not a form or a sign-in prompt", pausedText.slice(0, 150));
    await context.close();
  }

  // ==========================================================================
  section("Admin enables ordering through the real /food/admin UI");
  // ==========================================================================
  {
    const context = await browser.newContext();
    await context.addCookies([await mintCookie(ADMIN_USER_ID, "ADMIN")]);
    const page = await context.newPage();
    trackConsole(page);
    await page.goto(`${BASE}/food/admin`, { waitUntil: "networkidle" });

    const orderingSection = page.locator(".admin-section").first();
    check(/Próximamente/.test(await orderingSection.innerText()), "admin sees the ordering section defaulting to Coming soon (Spanish — the seller surface's real default)");

    await orderingSection.getByRole("button", { name: "Activar pedidos" }).click();
    await page.waitForTimeout(600);
    const settingRow = await prisma.foodPlatformSetting.findUnique({ where: { id: "singleton" } });
    check(settingRow?.orderingEnabled === true, "clicking Enable flips the REAL FoodPlatformSetting row in the database", settingRow);

    await page.reload({ waitUntil: "networkidle" });
    const orderingSectionAfter = page.locator(".admin-section").first();
    check(/Activo/.test(await orderingSectionAfter.innerText()), "…and the section now shows Live/Activo");
    check((await orderingSectionAfter.getByRole("button", { name: "Pausar pedidos" }).count()) > 0, "…with a Pause control in its place");
    await context.close();
  }

  // ==========================================================================
  section("Ordering ON, anonymous — the sign-in gate (never a redirect, never a guessed URL)");
  // ==========================================================================
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    trackConsole(page);
    await page.goto(`${BASE}/meals/${listingHappy.slug}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Request order" }).click();
    await page.waitForSelector('[role="dialog"]', { state: "visible" });
    const signedOutText = await page.locator('[role="dialog"]').innerText();
    check(/Sign in to see your orders/i.test(signedOutText), "anonymous + ordering ON: the sheet shows the sign-in notice, not the form", signedOutText.slice(0, 150));
    await context.close();
  }

  const buyerContext = await browser.newContext();
  await buyerContext.addCookies([await mintCookie(BUYER_USER_ID, "CLIENT")]);
  const buyerPage = await buyerContext.newPage();
  trackConsole(buyerPage);

  // ==========================================================================
  section("place -> accept -> complete, the full happy path");
  // ==========================================================================
  let happyOrderId;
  {
    await buyerPage.goto(`${BASE}/meals/${listingHappy.slug}`, { waitUntil: "networkidle" });
    await buyerPage.getByRole("button", { name: "Request order" }).click();
    await buyerPage.waitForSelector('[role="dialog"]', { state: "visible" });
    await buyerPage.locator("#order-quantity").fill("2");
    await buyerPage.locator("#order-item-note").fill("extra crispy");
    await buyerPage.locator("#order-date").fill(futureDateIso());
    await buyerPage.locator("#order-time").fill("15:30");
    await buyerPage.locator("#order-area").fill("Curepe");
    await buyerPage.getByRole("button", { name: "Send request" }).click();

    // Slice 14's own lesson: a length floor, not a bare regex, so `/orders/new`
    // (also lowercase-alphanumeric) could never be mistaken for a real cuid.
    // ⚠ Generous timeout — this is the FIRST `createOrderRequest` call of the
    // whole run, and it pays a one-time cold-path tax (the `/meals/[slug]`
    // route's Server Action bundle is lazily initialized on first invocation
    // even under `next start`, confirmed by tracing — every later call on
    // this same route is fast). Every OTHER `waitForURL` below stays at the
    // normal 10s now that the bundle is warm.
    await buyerPage.waitForURL(/\/orders\/[a-z0-9]{10,}$/i, { timeout: 45_000 });
    happyOrderId = new URL(buyerPage.url()).pathname.split("/").pop();

    const created = await prisma.foodOrder.findUnique({ where: { id: happyOrderId }, include: { items: true } });
    check(created?.status === "PENDING", "the order lands PENDING in the database", created?.status);
    check(created?.subtotalCents === 5000, "…with the correct subtotal (2 × $25.00)", created?.subtotalCents);
    check(created?.items[0]?.note === "extra crispy", "…and the item note round-tripped", created?.items[0]?.note);

    const buyerDetailText = await buyerPage.locator("body").innerText();
    check(/Pending/.test(buyerDetailText), "the buyer's own order detail page shows PENDING");
  }

  const sellerContext = await browser.newContext();
  await sellerContext.addCookies([await mintCookie(SELLER_USER_ID, "CLIENT")]);
  const sellerPage = await sellerContext.newPage();
  trackConsole(sellerPage);

  // Fetch the order number for a text-based locator (more robust than relying on DOM structure).
  const happyOrder = await prisma.foodOrder.findUniqueOrThrow({ where: { id: happyOrderId } });

  {
    await sellerPage.goto(`${BASE}/food/orders`, { waitUntil: "networkidle" });
    check((await sellerPage.locator(`text=${happyOrder.orderNumber}`).count()) > 0, "the seller's inbox lists the new PENDING order by its order number");

    await sellerPage.goto(`${BASE}/food/orders/${happyOrderId}`, { waitUntil: "networkidle" });
    // ⚠ The seller surface defaults to SPANISH (path-based, per `i18n/
    // request.ts` — NOT the JWT's `locale` claim, which this script's
    // `mintCookie` never even points at Spanish). Every seller-page locator
    // below uses the real Spanish copy, the same lesson `verify-admin-e2e.mjs`
    // paid for directly (its own comment: "this app's real default is
    // Spanish"). FIXED price -> the price input is PRE-FILLED; accepting
    // needs no typing.
    await sellerPage.getByRole("button", { name: "Aceptar pedido" }).click();
    await sellerPage.waitForTimeout(600);
    const accepted = await prisma.foodOrder.findUniqueOrThrow({ where: { id: happyOrderId } });
    check(accepted.status === "ACCEPTED" && accepted.acceptedAt !== null, "Accept flips the order to ACCEPTED in the database", accepted.status);

    await sellerPage.reload({ waitUntil: "networkidle" });
    check((await sellerPage.getByRole("button", { name: "Aceptar pedido" }).count()) === 0, "…and the Accept control is gone post-acceptance (an invalid transition is never OFFERED)");
    check((await sellerPage.getByRole("button", { name: "Marcar como completado" }).count()) > 0, "…replaced by Complete/Cancel");

    sellerPage.once("dialog", (d) => d.accept());
    await sellerPage.getByRole("button", { name: "Marcar como completado" }).click();
    await sellerPage.waitForTimeout(600);
    const completed = await prisma.foodOrder.findUniqueOrThrow({ where: { id: happyOrderId } });
    check(completed.status === "COMPLETED" && completed.completedAt !== null, "Complete flips the order to COMPLETED", completed.status);

    await sellerPage.reload({ waitUntil: "networkidle" });
    check(
      (await sellerPage.getByRole("button", { name: "Marcar como completado" }).count()) === 0 &&
        (await sellerPage.getByRole("button", { name: "Cancelar pedido" }).count()) === 0,
      "…and NO action is offered on a COMPLETED order — every transition is now invalid, and the UI reflects that",
    );
  }

  {
    await buyerPage.goto(`${BASE}/orders/${happyOrderId}`, { waitUntil: "networkidle" });
    check(/Completed/.test(await buyerPage.locator("body").innerText()), "the buyer's own page reflects COMPLETED too");
  }

  // ==========================================================================
  section("Availability validation blocks an out-of-window request");
  // ==========================================================================
  {
    await buyerPage.goto(`${BASE}/meals/${listingOutOfWindow.slug}`, { waitUntil: "networkidle" });
    await buyerPage.getByRole("button", { name: "Request order" }).click();
    await buyerPage.waitForSelector('[role="dialog"]', { state: "visible" });
    await buyerPage.locator("#order-date").fill(futureDateIso());
    await buyerPage.locator("#order-time").fill("12:00");
    await buyerPage.getByRole("button", { name: "Send request" }).click();
    const errorText = await pollForAlertText(buyerPage);
    check(/isn't offered on that day/i.test(errorText), "the sheet reports the out-of-window rejection", errorText);
    const orderCount = await prisma.foodOrder.count({ where: { items: { some: { listingId: listingOutOfWindow.id } } } });
    check(orderCount === 0, "…and no order was created", orderCount);
    await buyerPage.keyboard.press("Escape");
  }

  // ==========================================================================
  section("QUOTE pricing — Accept requires a seller-supplied price");
  // ==========================================================================
  {
    await buyerPage.goto(`${BASE}/meals/${listingQuote.slug}`, { waitUntil: "networkidle" });
    await buyerPage.getByRole("button", { name: "Request order" }).click();
    await buyerPage.waitForSelector('[role="dialog"]', { state: "visible" });
    await buyerPage.locator("#order-date").fill(futureDateIso());
    await buyerPage.locator("#order-time").fill("11:00");
    await buyerPage.getByRole("button", { name: "Send request" }).click();
    await buyerPage.waitForURL(/\/orders\/[a-z0-9]{10,}$/i, { timeout: 10_000 });
    const quoteOrderId = new URL(buyerPage.url()).pathname.split("/").pop();

    const quoteOrder = await prisma.foodOrder.findUniqueOrThrow({ where: { id: quoteOrderId }, include: { items: true } });
    check(quoteOrder.items[0].priceCentsSnapshot === null, "a QUOTE item snapshots a NULL price at creation", quoteOrder.items[0].priceCentsSnapshot);
    check(quoteOrder.subtotalCents === null, "…so the order subtotal is null until the seller prices it");

    await sellerPage.goto(`${BASE}/food/orders/${quoteOrderId}`, { waitUntil: "networkidle" });
    await sellerPage.getByRole("button", { name: "Aceptar pedido" }).click();
    await sellerPage.waitForTimeout(600);
    const stillPending = await prisma.foodOrder.findUniqueOrThrow({ where: { id: quoteOrderId } });
    check(stillPending.status === "PENDING", "the SERVER rejects accepting with no price entered — still PENDING", stillPending.status);
    const priceErrorText = await sellerPage.locator("body").innerText();
    check(priceErrorText.includes("Ingresa un precio para cada artículo"), "…and shows the real priceRequired error, not a silent no-op");

    await sellerPage.locator('input[id^="accept-price-"]').fill("35.00");
    await sellerPage.getByRole("button", { name: "Aceptar pedido" }).click();
    await sellerPage.waitForTimeout(600);
    const priced = await prisma.foodOrder.findUniqueOrThrow({ where: { id: quoteOrderId }, include: { items: true } });
    check(priced.status === "ACCEPTED" && priced.items[0].priceCentsSnapshot === 3500 && priced.subtotalCents === 3500, "…and with a real price entered, Accept succeeds and locks the agreed price", priced);
  }

  // ==========================================================================
  section("Decline, with a reason");
  // ==========================================================================
  {
    await buyerPage.goto(`${BASE}/meals/${listingHappy.slug}`, { waitUntil: "networkidle" });
    await buyerPage.getByRole("button", { name: "Request order" }).click();
    await buyerPage.waitForSelector('[role="dialog"]', { state: "visible" });
    await buyerPage.locator("#order-date").fill(futureDateIso());
    await buyerPage.locator("#order-time").fill("10:00");
    await buyerPage.getByRole("button", { name: "Send request" }).click();
    await buyerPage.waitForURL(/\/orders\/[a-z0-9]{10,}$/i, { timeout: 10_000 });
    const declineOrderId = new URL(buyerPage.url()).pathname.split("/").pop();

    await sellerPage.goto(`${BASE}/food/orders/${declineOrderId}`, { waitUntil: "networkidle" });
    await sellerPage.getByRole("button", { name: "Rechazar" }).click();
    await sellerPage.getByPlaceholder("Cuéntale al cliente por qué, si quieres").fill("Fully booked that day");
    await sellerPage.getByRole("button", { name: "Confirmar rechazo" }).click();
    await sellerPage.waitForTimeout(600);
    const declined = await prisma.foodOrder.findUniqueOrThrow({ where: { id: declineOrderId } });
    check(declined.status === "DECLINED" && declined.declineReason === "Fully booked that day", "Decline stores the status AND the reason", declined);

    await buyerPage.goto(`${BASE}/orders/${declineOrderId}`, { waitUntil: "networkidle" });
    const buyerText = await buyerPage.locator("body").innerText();
    check(/Declined/.test(buyerText) && buyerText.includes("Fully booked that day"), "the buyer sees the decline AND the seller's reason");
  }

  // ==========================================================================
  section("place -> expire, via the REAL sweep CLI (shelled out to, not reimplemented)");
  // ==========================================================================
  {
    await buyerPage.goto(`${BASE}/meals/${listingHappy.slug}`, { waitUntil: "networkidle" });
    await buyerPage.getByRole("button", { name: "Request order" }).click();
    await buyerPage.waitForSelector('[role="dialog"]', { state: "visible" });
    await buyerPage.locator("#order-date").fill(futureDateIso());
    await buyerPage.locator("#order-time").fill("09:00");
    await buyerPage.getByRole("button", { name: "Send request" }).click();
    await buyerPage.waitForURL(/\/orders\/[a-z0-9]{10,}$/i, { timeout: 10_000 });
    const expireOrderId = new URL(buyerPage.url()).pathname.split("/").pop();

    // The UI always sets `respondBy` = now + 24h; backdating it to test expiry
    // needs a direct write, mirroring `verify-story-posting.mjs`'s own
    // backdated-fixture precedent.
    await prisma.foodOrder.update({ where: { id: expireOrderId }, data: { respondBy: new Date(Date.now() - 60_000) } });

    // `shell: true` — on Windows, `npx` is a `.cmd` shim that `execFileSync`
    // cannot invoke directly without a shell.
    execFileSync("npx", ["tsx", "scripts/sweep.ts", "--once"], { cwd: process.cwd(), stdio: "pipe", shell: true });

    const expired = await prisma.foodOrder.findUniqueOrThrow({ where: { id: expireOrderId } });
    check(expired.status === "EXPIRED" && expired.expiredAt !== null, "the real `food-sweep --once` CLI expires the backdated PENDING order", expired.status);

    await buyerPage.goto(`${BASE}/orders/${expireOrderId}`, { waitUntil: "networkidle" });
    const expiredText = await buyerPage.locator("body").innerText();
    check(/Expired/.test(expiredText), "the buyer's own page reflects EXPIRED");
    check((await buyerPage.getByRole("link", { name: /Browse other sellers/i }).count()) > 0, "…and nudges toward browsing other sellers (Part E5: never dies silently)");
  }

  // ==========================================================================
  section("Cancel — either party, before fulfilment");
  // ==========================================================================
  {
    await buyerPage.goto(`${BASE}/meals/${listingHappy.slug}`, { waitUntil: "networkidle" });
    await buyerPage.getByRole("button", { name: "Request order" }).click();
    await buyerPage.waitForSelector('[role="dialog"]', { state: "visible" });
    await buyerPage.locator("#order-date").fill(futureDateIso());
    await buyerPage.locator("#order-time").fill("08:00");
    await buyerPage.getByRole("button", { name: "Send request" }).click();
    await buyerPage.waitForURL(/\/orders\/[a-z0-9]{10,}$/i, { timeout: 10_000 });
    const cancelOrderId = new URL(buyerPage.url()).pathname.split("/").pop();

    await buyerPage.getByRole("button", { name: "Cancel order" }).click();
    await buyerPage.getByPlaceholder("Let the seller know why, if you'd like").fill("Changed my mind");
    await buyerPage.getByRole("button", { name: "Confirm cancellation" }).click();
    await buyerPage.waitForTimeout(600);
    const cancelled = await prisma.foodOrder.findUniqueOrThrow({ where: { id: cancelOrderId } });
    check(
      cancelled.status === "CANCELLED_BY_CUSTOMER" && cancelled.cancellationReason === "Changed my mind",
      "the buyer's own Cancel control lands CANCELLED_BY_CUSTOMER with the reason stored",
      cancelled,
    );
  }

  check(consoleErrors.length === 0, "zero browser console errors across the whole lifecycle", consoleErrors.slice(0, 5));

  // Leave the global launch gate the way this run found it, then remove the
  // verification fixtures themselves.
  await prisma.foodPlatformSetting.update({ where: { id: "singleton" }, data: { orderingEnabled: false } });
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
