/**
 * PD-S10 browser pass — the Food seller demo, driven through a real browser
 * against a real running server.
 *
 *   # in one terminal, with the ecosystem stub's port in the env:
 *   ECOSYSTEM_API_BASE_URL=http://127.0.0.1:8767 npm run dev
 *   # in another:
 *   node scripts/verify-demo-browser.mjs [--base http://localhost:3012] [--shots ./out]
 *
 * ## ⚠ This script deliberately does NOT need a database, and that is a test
 *
 * Every other `verify-*-browser.mjs` in this repo seeds Postgres first. This one
 * imports no Prisma client and creates no rows — because plan D4/D5 say the demo
 * is fixtures only, and the cleanest possible proof of that is to run the whole
 * thing **with Postgres switched off**. If a control ever escapes the PD-S10
 * actions seam and reaches a real Server Action, that action's first query fails
 * and the assertion here fails with it, loudly.
 *
 * So: run it with the local database DOWN. That is not a limitation, it is the
 * assertion. (It passes with the database up too — it simply proves less.)
 * Apparel's PD-S9 pass recommended exactly this and Food follows it.
 *
 * ## What it drives
 *
 * The access guard in all three modes, then every interactive control the
 * coverage contract names (plan §3, Food row): the quote-price accept and its
 * `priceRequired` refusal, decline with a reason, complete, cancel, the listing
 * pause switch, a real reply in the persistent thread, and the three PC-1
 * conversation settings. Then the informational Fresh Today section, the buyer
 * phone frame, both locales, and the refresh-resets guarantee.
 *
 * ## ⚠ The composer-visibility assertion is the one the plan singles out
 *
 * `resolveThreadAccess` is a live function of order state and a seller setting,
 * so a demo whose composer is unconditionally present would misrepresent the
 * feature it exists to show. This script turns `postOrderMessaging` OFF and
 * asserts that Ayanna's composer is REPLACED by the real refusal notice while
 * Rafael's — who has an active order — survives untouched. Then it turns it back
 * on and asserts the composer returns.
 *
 * ## ⚠ The sandbox alarm is checked at the very end
 *
 * `data-demo-sandbox-problem` is what `<DemoSandbox>` renders when an action is
 * called with an id the fixtures do not contain. Plan R1's mitigation is that
 * such a failure must be LOUD rather than a control that quietly does nothing —
 * this is where that is enforced.
 *
 * ## The 31-second waits are not padding
 *
 * `getDemoAccessMode()` holds a 30s TTL cache in the server process. Flipping
 * the stub's mode and asserting immediately would test the cache, not the guard.
 */

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import { encode } from "next-auth/jwt";

const SHARED_TOOL = "C:/Users/Karpa/.claude/tools/browser-testing";
const require = createRequire(path.join(SHARED_TOOL, "package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = arg("base", "http://localhost:3012");
const SHOTS = arg("shots", "");
const ECOSYSTEM_PORT = 8767;
const DEMO_PATH = "/food/demo";
/** The server's demo-mode TTL is 30s; one extra second removes the race. */
const TTL_WAIT_MS = 31_000;

let passes = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) {
    passes += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n-- ${title} ${"-".repeat(Math.max(0, 68 - title.length))}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -- The ecosystem stub ------------------------------------------------------

/**
 * Stands in for portal-web. Mutable, because the guard's whole job is to behave
 * differently as the toggle moves, and a fixed stub could only ever test one
 * third of it.
 */
const stubState = { mode: "OFF", memberships: [] };
let stubHits = 0;

function startEcosystemStub() {
  const server = http.createServer((req, res) => {
    stubHits += 1;
    res.setHeader("Content-Type", "application/json");
    if (/\/config\/demo$/.test(req.url)) {
      res.writeHead(200);
      res.end(JSON.stringify({ demo: { mode: stubState.mode } }));
      return;
    }
    if (/\/memberships$/.test(req.url)) {
      res.writeHead(200);
      res.end(JSON.stringify({ memberships: stubState.memberships }));
      return;
    }
    res.writeHead(200);
    res.end("{}");
  });
  return new Promise((resolve) =>
    server.listen(ECOSYSTEM_PORT, "127.0.0.1", () => resolve(server)),
  );
}

// -- Sessions ----------------------------------------------------------------

/**
 * ⚠ The cookie NAME must mirror portal-web's `isSecure` expression exactly, for
 * the reason `lib/session.ts` records at length: next-auth v5 derives the JWE
 * key from (secret, salt) with the cookie name AS the salt, so a mismatched name
 * makes the token undecryptable rather than merely un-found. `next dev` is not
 * production, so the unprefixed name is correct here.
 */
async function mintCookie({ userId, emailVerified, locale }) {
  const cookieName = "authjs.session-token";
  const value = await encode({
    secret: process.env.AUTH_SECRET,
    salt: cookieName,
    maxAge: 30 * 24 * 60 * 60,
    token: {
      id: userId,
      sub: userId,
      name: "Demo Visitor",
      email: `${userId}@example.invalid`,
      role: "CLIENT",
      locale,
      // ⚠ Deliberately EMPTY, even when the stub grants standing. This
      // reproduces the staleness case `lib/session.ts` documents: if
      // `resolveDemoAccess` ever read the JWT claim instead of the ecosystem
      // API, APPROVED_PROVIDER mode would let this token straight through.
      memberships: [],
      emailVerified,
    },
  });
  return { name: cookieName, value };
}

async function contextFor(browser, cookie, locale) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const cookies = [];
  if (cookie) cookies.push({ ...cookie, url: BASE });
  // The seller surface defaults to Spanish (i18n/request.ts); an explicit
  // NEXT_LOCALE is how each pass pins the language it asserts against.
  if (locale) cookies.push({ name: "NEXT_LOCALE", value: locale, url: BASE });
  if (cookies.length) await context.addCookies(cookies);
  return context;
}

async function statusOf(context, url) {
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  const result = { status: response?.status() ?? 0, url: page.url() };
  await page.close();
  return result;
}

const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

/**
 * Clicks one of the settings switches and waits for it to settle.
 *
 * WARNING: fixed sleeps are wrong here and the first version of this script
 * proved it. `<MessageSettingsFields>` wraps its action in `useTransition` and
 * follows it with `router.refresh()`, so the switch is `disabled` for the whole
 * round trip - which on a dev server is easily longer than any sleep worth
 * writing. Polling the disabled attribute tests the thing that actually matters
 * (the control came back) instead of guessing at a duration.
 */
async function toggleSwitch(page, index) {
  const sw = page.getByRole("switch").nth(index);
  await sw.waitFor({ state: "visible", timeout: 20000 });
  for (let i = 0; i < 120 && (await sw.isDisabled()); i += 1) await sleep(250);
  await sw.click();
  for (let i = 0; i < 120 && (await sw.isDisabled()); i += 1) await sleep(250);
  // One more beat so the re-render that follows the refresh has committed.
  await page.waitForTimeout(250);
}

/** True if the selector becomes visible within `ms`, false if it never does. */
async function appears(page, selector, ms = 15000) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens a fixture order and waits for its detail view.
 *
 * WARNING: a bare `.click()` here is flaky and was observed failing on a cold
 * dev server. The button exists in the server-rendered markup before React has
 * hydrated, so an early click is dispatched at nothing and the failure looks
 * exactly like a broken control. Retrying until the detail view actually
 * appears tests the control rather than the timing.
 */
async function openOrder(page, id) {
  const row = page.locator(`[data-demo-order="${id}"]`);
  await row.waitFor({ state: "visible", timeout: 20000 });
  const status = page.locator("[data-demo-order-status]");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await row.click();
    try {
      await status.waitFor({ state: "attached", timeout: 4000 });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`order ${id} never opened - the demo detail view did not appear`);
}

/** Opens a fixture conversation from the real <ThreadList>, same retry reasoning. */
async function openThread(page, label) {
  const row = page.getByText(label).first();
  await row.waitFor({ state: "visible", timeout: 20000 });
  const slot = page.locator("[data-demo-composer-slot]");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await row.click();
    try {
      await slot.waitFor({ state: "attached", timeout: 4000 });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`conversation ${label} never opened`);
}

/** Waits for the composer slot to report `want`, then returns what it reports. */
async function composerSlot(page, want, ms = 15000) {
  const slot = page.locator("[data-demo-composer-slot]");
  await slot.waitFor({ state: "attached", timeout: ms });
  const deadline = Date.now() + ms;
  let value = await slot.getAttribute("data-demo-composer-slot");
  while (value !== want && Date.now() < deadline) {
    await sleep(200);
    value = await slot.getAttribute("data-demo-composer-slot");
  }
  return value;
}

// -- The run -----------------------------------------------------------------

async function run() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET must be set (see .env.local)");

  // Preflight: the dev server has to already be up. Failing here with a clear
  // message beats forty confusing timeouts.
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    throw new Error(`no server at ${BASE} — start \`npm run dev\` first (${err.message})`);
  }

  const stub = await startEcosystemStub();
  console.log(`ecosystem stub listening on 127.0.0.1:${ECOSYSTEM_PORT} (mode=${stubState.mode})`);

  const browser = await chromium.launch();
  const verified = await mintCookie({ userId: "demo-visitor", emailVerified: true, locale: "en" });
  const unverified = await mintCookie({ userId: "demo-unverified", emailVerified: false, locale: "en" });

  const failedResponses = [];
  const consoleErrors = [];
  /** Requests for REAL dashboard routes - any entry means a link escaped the demo. */
  const escapedNavigations = [];

  try {
    // == 1. The guard, mode OFF ==============================================
    //
    // ⚠ Settle first. The dev server is long-lived and `getDemoAccessMode()`
    // caches for 30s, so a re-run inside that window would open on whatever mode
    // the PREVIOUS run left cached. A security assertion that passes or fails on
    // timing is worse than no assertion.
    console.log(`\n  (settling: waiting ${TTL_WAIT_MS / 1000}s so a previous run's cached mode cannot leak in...)`);
    await sleep(TTL_WAIT_MS);

    section("Access guard - OFF");
    {
      const ctx = await contextFor(browser, verified, "en");
      const { status } = await statusOf(ctx, `${BASE}${DEMO_PATH}`);
      check(
        status === 404,
        "OFF: a signed-in, verified visitor gets 404 - not 403, not a redirect",
        `status ${status}`,
      );
      await ctx.close();
    }
    check(stubHits > 0, "the server actually reached the stub (ECOSYSTEM_API_BASE_URL points here)");

    // == 2. VERIFIED_EMAIL ===================================================
    stubState.mode = "VERIFIED_EMAIL";
    console.log(`\n  (waiting ${TTL_WAIT_MS / 1000}s for the server's demo-mode TTL cache to expire...)`);
    await sleep(TTL_WAIT_MS);

    section("Access guard - VERIFIED_EMAIL");
    {
      const ctx = await contextFor(browser, null, "en");
      const { url } = await statusOf(ctx, `${BASE}${DEMO_PATH}`);
      check(
        url.includes("/login") && url.includes(encodeURIComponent(DEMO_PATH)),
        "signed out: sent to the sign-in door, carrying a callbackUrl back to the demo",
        url,
      );
      await ctx.close();
    }
    {
      const ctx = await contextFor(browser, unverified, "en");
      const { status } = await statusOf(ctx, `${BASE}${DEMO_PATH}`);
      check(status === 404, "unverified email: 404, the same undifferentiated denial", `status ${status}`);
      await ctx.close();
    }

    // == 3. The demo itself ==================================================
    const ctx = await contextFor(browser, verified, "en");
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);

    page.on("response", (res) => {
      if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`);
    });
    // WARNING: this list is the regression guard for a real bug PD-S10 shipped and
    // then fixed. With a bubble-phase click handler the demo's link guard ran
    // AFTER next/link had already called router.push(), so clicking a
    // conversation row or a dish title fired a genuine request for the real
    // dashboard route - which in production redirects a seller-less visitor
    // straight out of the demo to /food/setup. Capture-phase interception fixed
    // it; this makes sure it stays fixed.
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.origin !== new URL(BASE).origin) return;
      if (/^\/food\/(messages|listings|orders|profile|stories|setup)(\/|$)/.test(u.pathname)) {
        escapedNavigations.push(u.pathname);
      }
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE}${DEMO_PATH}`, { waitUntil: "domcontentloaded" });

    section("The demo opens");
    check(await page.locator("[data-demo-heading]").first().isVisible(), "a section heading renders");
    check(
      (await page.locator("[data-demo-section]").count()) === 4,
      "exactly four sections - orders, menu, messages, Fresh Today (no availability, no peer view)",
    );
    check(
      (await page.locator('[data-demo-section="availability"]').count()) === 0,
      "no availability section: Food has none at the seller level, and the plan says omit rather than empty",
    );
    check(
      await page.locator("[data-demo-photo-credits]").isVisible(),
      "the photo credit line is present - CC BY/BY-SA both require attribution",
    );
    await shot(page, "demo-orders");

    // -- Photos actually load ------------------------------------------------
    {
      const res = await page.request.get(`${BASE}/api/food/demo-media/doubles.webp`);
      check(res.status() === 200, "a committed demo photo is served by /api/food/demo-media", `status ${res.status()}`);
      // These filenames are slot names, not content hashes, so `immutable`
      // would strand a replaced photo in caches. See the route's own note.
      const cc = res.headers()["cache-control"] ?? "";
      check(
        cc.includes("must-revalidate") && !cc.includes("immutable"),
        "demo photos are cached but revalidated - a slot name is not a content hash",
        cc,
      );
      // WARNING: a literal `../` here is COLLAPSED BY THE URL PARSER before the
      // request is ever sent, so the old version of this assertion resolved to
      // `/api/food/.env`, never reached the route, and would have passed with
      // the allow-list deleted. Percent-encoding the dots is what actually
      // delivers the traversal attempt to the handler. The plain off-manifest
      // name is the second half: the allow-list refuses on membership, so it
      // does not matter which shape the attempt takes.
      const traversal = await page.request.get(
        `${BASE}/api/food/demo-media/%2e%2e%2f%2e%2e%2f.env`,
      );
      check(
        traversal.status() === 404,
        "an ENCODED traversal attempt reaches the route and is refused",
        `status ${traversal.status()}`,
      );
      const offManifest = await page.request.get(`${BASE}/api/food/demo-media/secret.webp`);
      check(
        offManifest.status() === 404,
        "an off-manifest filename is refused - the allow-list IS the guard",
        `status ${offManifest.status()}`,
      );
    }

    // == 4. Orders - the quote accept, and its refusal ========================
    //
    // WARNING: SEQUENCE IS LOAD-BEARING BELOW. The cancel test is deliberately
    // held back until after the Messages section, because the only ACCEPTED
    // order in the fixtures (FD-2038) is exactly what keeps Rafael's
    // conversation writable. Cancelling it first would leave him with no active
    // order, and the gate assertion would then pass for the wrong reason.
    section("Orders - accept with a quote price");
    await openOrder(page, "demo-order-quote");
    check(
      (await page.locator("[data-demo-order-status]").getAttribute("data-demo-order-status")) === "PENDING",
      "the quote order opens as PENDING",
    );

    // The blank submit must be REFUSED: a QUOTE item has no price snapshot, so
    // acceptOrder's own priceRequired rule applies here exactly as in production.
    await page.getByRole("button", { name: "Accept order", exact: true }).click();
    await page.waitForTimeout(500);
    check(
      (await page.locator("[data-demo-order-status]").getAttribute("data-demo-order-status")) === "PENDING",
      "accepting a QUOTE order with no price is REFUSED - the real priceRequired rule, not a simplified subset",
    );

    await page.locator('input[id^="accept-price-"]').first().fill("450");
    await page.getByRole("button", { name: "Accept order", exact: true }).click();
    await page.waitForTimeout(700);
    check(
      (await page.locator("[data-demo-order-status]").getAttribute("data-demo-order-status")) === "ACCEPTED",
      "with a price named, the order becomes ACCEPTED",
    );
    check(
      (await page.locator("[data-demo-order-subtotal]").innerText()).includes("450"),
      "the subtotal recalculates from the price the seller just named",
    );
    check(
      (await page.getByRole("button", { name: "Accept order", exact: true }).count()) === 0,
      "accept/decline are gone once accepted - decideOrderTransition, not a demo script",
    );
    await shot(page, "demo-order-accepted");

    // -- complete ------------------------------------------------------------
    section("Orders - complete");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Mark as completed", exact: true }).click();
    await page.waitForTimeout(700);
    check(
      (await page.locator("[data-demo-order-status]").getAttribute("data-demo-order-status")) === "COMPLETED",
      "an ACCEPTED order completes",
    );
    await page.locator("[data-demo-order-back]").click();
    await page.waitForTimeout(300);

    // -- decline with a reason ----------------------------------------------
    section("Orders - decline with a reason");
    await openOrder(page, "demo-order-priced");
    await page.getByRole("button", { name: "Decline", exact: true }).click();
    await page.locator("textarea").first().fill("Fully booked that weekend, sorry!");
    await page.getByRole("button", { name: "Confirm decline", exact: true }).click();
    await page.waitForTimeout(700);
    check(
      (await page.locator("[data-demo-order-status]").getAttribute("data-demo-order-status")) === "DECLINED",
      "a PENDING order declines, carrying the reason",
    );
    check(
      (await page.locator("body").innerText()).includes("Fully booked"),
      "the decline reason is shown back on the order",
    );
    await page.locator("[data-demo-order-back]").click();
    await page.waitForTimeout(300);

    // == 5. Menu - the pause switch ==========================================
    section("Menu - pause and resume");
    await page.locator('[data-demo-section="listings"]').click();
    await page.waitForTimeout(400);
    const listingSwitch = page.getByRole("switch").first();
    const beforePause = await listingSwitch.getAttribute("aria-checked");
    await toggleSwitch(page, 0);
    check(
      (await listingSwitch.getAttribute("aria-checked")) !== beforePause,
      "the listing pause switch flips through the actions seam",
    );

    // The editor link is real and out of tour: the demo explains rather than
    // ejecting the visitor onto a page demanding a real seller row.
    // Scoped to a LISTING link on purpose: the first anchor on the page is the
    // banner's own "leave the demo" link, which is meant to navigate.
    await page.locator('a[href^="/food/listings/"]').first().click();
    await page.waitForTimeout(500);
    check(
      await page.locator("[data-demo-notice]").isVisible(),
      "the out-of-tour editor link explains itself instead of navigating",
    );
    check(page.url().includes(DEMO_PATH), "and the visitor is still in the demo", page.url());
    await page.locator('[aria-label="Dismiss"]').click();
    await shot(page, "demo-listings");

    // == 6. Messages - the gate, which is the point ==========================
    section("Messages - the PC-1 gate, driven for real");
    await page.locator('[data-demo-section="messages"]').click();
    await page.waitForTimeout(400);

    // Ayanna: engaged (a COMPLETED order), nothing open -> subject to the setting.
    await openThread(page, "ayanna@example.com");
    check(
      (await composerSlot(page, "composer")) === "composer",
      "with post-order messaging ON, the closed-order customer CAN be replied to",
    );

    await page.locator("textarea").first().fill("Of course, send me the date and I will pencil it in.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForTimeout(700);
    check(
      (await page.locator("body").innerText()).includes("pencil it in"),
      "the reply appears in the transcript",
    );
    // The paperclip is the ONE mutation that is a fetch rather than a Server
    // Action. Before PD-S10's review it escaped the seam entirely and performed
    // a REAL upload from inside the demo; this asserts it now goes through the
    // sandbox and says so.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "kitchen.webp",
      mimeType: "image/webp",
      buffer: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    });
    check(
      await appears(page, "[data-demo-notice]"),
      "attaching a photo is answered by the sandbox, and the demo says the visitor's own file was not kept",
    );
    await page.locator('[aria-label="Dismiss"]').click();

    await shot(page, "demo-thread");
    await page.locator("[data-demo-thread-back]").click();
    await page.waitForTimeout(300);

    // Flip the opt-out and re-check BOTH conversations.
    await toggleSwitch(page, 0);
    check(
      await appears(page, "[data-demo-opted-out-notice]"),
      "turning post-order messaging off shows the seller their own opt-out notice",
    );

    await openThread(page, "ayanna@example.com");
    check(
      (await composerSlot(page, "activeOrdersOnly")) === "activeOrdersOnly",
      "THE ASSERTION: the closed-order customer composer is REPLACED by the real refusal, not merely hidden",
    );
    check(
      (await page.locator("body").innerText()).includes("turned off messages between orders"),
      "and the seller reads their OWN wording of it, not the buyer's",
    );
    await page.locator("[data-demo-thread-back]").click();
    await page.waitForTimeout(300);

    await openThread(page, "rafael@example.com");
    check(
      (await composerSlot(page, "composer")) === "composer",
      "the customer with an ACTIVE order keeps his composer - the opt-out narrows chat TO open orders, never removes it FROM them",
    );
    await page.locator("[data-demo-thread-back]").click();
    await page.waitForTimeout(300);

    // Back on, and the composer returns.
    await toggleSwitch(page, 0);
    await openThread(page, "ayanna@example.com");
    check(
      (await composerSlot(page, "composer")) === "composer",
      "turning it back on restores the composer",
    );
    await page.locator("[data-demo-thread-back]").click();
    await page.waitForTimeout(300);

    // == 7. Read receipts + delivery =========================================
    section("Read receipts - a disclosure-only setting, shown from both sides");
    {
      check(
        await page.locator("[data-demo-client-view]").isVisible(),
        "the buyer phone frame renders beside the seller view",
      );
      const bodyBefore = await page.locator("body").innerText();
      // The second switch is read receipts (post-order, receipts, then the
      // three-way delivery radio group).
      await toggleSwitch(page, 1);
      const bodyAfter = await page.locator("body").innerText();
      check(
        bodyBefore !== bodyAfter,
        "flipping read receipts changes what is rendered - it is a live setting, not a dead control",
      );
      await toggleSwitch(page, 1);
    }
    {
      const radios = page.getByRole("radio");
      const off = radios.last();
      for (let i = 0; i < 60 && (await off.isDisabled()); i += 1) await sleep(250);
      await off.click();
      for (let i = 0; i < 60 && (await off.isDisabled()); i += 1) await sleep(250);
      check(
        (await off.getAttribute("aria-checked")) === "true",
        "the chat notification-delivery choice moves to OFF",
      );
    }

    // == 7b. Orders - cancel (held until the gate assertions are done) =======
    section("Orders - cancel an accepted order");
    await page.locator('[data-demo-section="orders"]').click();
    await page.waitForTimeout(400);
    await openOrder(page, "demo-order-accepted");
    await page.getByRole("button", { name: "Cancel order", exact: true }).click();
    await page.locator("textarea").first().fill("Kitchen flooded.");
    await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
    await page.waitForTimeout(700);
    check(
      (await page.locator("[data-demo-order-status]").getAttribute("data-demo-order-status")) ===
        "CANCELLED_BY_SELLER",
      "a seller cancellation lands on CANCELLED_BY_SELLER, not the customer terminal value",
    );
    await page.locator("[data-demo-order-back]").click();
    await page.waitForTimeout(300);

    // == 8. Fresh Today - informational, and inert ===========================
    section("Fresh Today - informational");
    await page.locator('[data-demo-section="stories"]').click();
    await page.waitForTimeout(300);
    check(await page.locator("[data-demo-preview-only]").isVisible(), "the preview-only caption says why nothing responds");
    check(
      (await page.locator("[inert]").count()) > 0,
      "the section is rendered inside an inert wrapper, not merely unwired",
    );
    check(await page.locator("[data-demo-display-name]").isVisible(), "the display-name callout is present");
    await shot(page, "demo-stories");

    // == 9. State survives section switching =================================
    section("State survives navigation between sections");
    await page.locator('[data-demo-section="orders"]').click();
    await page.waitForTimeout(300);
    check(
      (await page.locator("body").innerText()).includes("Nothing waiting"),
      "with both requests answered, the pending list is genuinely empty",
    );
    await openOrder(page, "demo-order-quote");
    check(
      (await page.locator("[data-demo-order-status]").getAttribute("data-demo-order-status")) === "COMPLETED",
      "the order completed earlier is STILL completed after visiting three other sections",
    );

    // == 10. A refresh resets everything =====================================
    section("A refresh resets the sandbox (D4/D5)");
    await page.reload({ waitUntil: "domcontentloaded" });
    // Wait for hydration before clicking: a click dispatched against the
    // server-rendered markup does nothing, and the failure looks exactly like a
    // broken control.
    await openOrder(page, "demo-order-quote");
    check(
      (await page.locator("[data-demo-order-status]").getAttribute("data-demo-order-status")) === "PENDING",
      "after a refresh the order is PENDING again - nothing persisted anywhere",
    );

    // == 11. Spanish ==========================================================
    section("Bilingual (R3)");
    {
      const esCtx = await contextFor(browser, verified, "es");
      const esPage = await esCtx.newPage();
      esPage.setDefaultTimeout(20000);
      await esPage.goto(`${BASE}${DEMO_PATH}`, { waitUntil: "domcontentloaded" });
      const text = await esPage.locator("body").innerText();
      check(text.includes("Cocina de demostración"), "the demo chrome is Spanish under NEXT_LOCALE=es");
      check(text.includes("Pedidos") && text.includes("Menú"), "the section labels are Spanish");
      check(!text.includes("Demo kitchen"), "no English chrome leaked into the Spanish pass");
      await shot(esPage, "demo-es");
      await esCtx.close();
    }

    // == 11b. APPROVED_PROVIDER - the discreet mode ==========================
    //
    // Held to the end because it costs another TTL wait. Both branches matter,
    // and the second is the one that proves the guard reads the ECOSYSTEM API
    // rather than the JWT: every cookie this script mints carries an EMPTY
    // `memberships` claim, so a token-trusting guard would refuse the provider
    // below even while the stub grants them standing.
    stubState.mode = "APPROVED_PROVIDER";
    console.log(`\n  (waiting ${TTL_WAIT_MS / 1000}s for the demo-mode TTL cache again...)`);
    await sleep(TTL_WAIT_MS);

    section("Access guard - APPROVED_PROVIDER");
    {
      const noStanding = await contextFor(browser, verified, "en");
      const { status } = await statusOf(noStanding, `${BASE}${DEMO_PATH}`);
      check(
        status === 404,
        "APPROVED_PROVIDER: a verified visitor with no provider membership anywhere gets 404",
        `status ${status}`,
      );
      await noStanding.close();
    }
    {
      // ANY vertical, not just Food - the 2026-08-19 ruling is that provider
      // standing anywhere unlocks every demo, since the point is helping
      // someone weigh a SECOND vertical.
      stubState.memberships = [{ vertical: "SALON", role: "PROVIDER", status: "ACTIVE" }];
      // A fresh user id, because getMemberships() holds its own 60s TTL cache
      // keyed by userId - reusing the previous visitor would read their cached
      // empty list rather than the stub's new answer.
      const providerCookie = await mintCookie({
        userId: "demo-provider",
        emailVerified: true,
        locale: "en",
      });
      const standing = await contextFor(browser, providerCookie, "en");
      const { status } = await statusOf(standing, `${BASE}${DEMO_PATH}`);
      check(
        status === 200,
        "an ACTIVE PROVIDER membership in ANY vertical opens the demo - read from the ecosystem API, not from the empty JWT claim",
        `status ${status}`,
      );
      await standing.close();
    }

    // == 12. Nothing broke quietly ===========================================
    section("Nothing broke quietly");
    check(
      (await page.locator("[data-demo-sandbox-problem]").count()) === 0,
      "the sandbox raised no fixture-mismatch alarm (plan R1)",
      "see console for [demo-sandbox] lines",
    );
    // The two deliberate 404 probes above are the only expected failures.
    const realApi = failedResponses.filter(
      (r) => !/\/api\/food\/demo-media\/(%2e|secret\.webp)/.test(r),
    );
    check(
      realApi.length === 0,
      "no request failed - with Postgres DOWN, this also proves no control reached a real Server Action",
      realApi.slice(0, 5).join(" | "),
    );
    const noisy = consoleErrors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
    check(noisy.length === 0, "no console errors", noisy.slice(0, 3).join(" | "));
    check(
      escapedNavigations.length === 0,
      "no link escaped the demo into a real dashboard route (the capture-phase guard holds)",
      [...new Set(escapedNavigations)].join(" | "),
    );

    await ctx.close();
  } finally {
    await browser.close();
    stub.close();
  }

  console.log(`\n${passes} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
