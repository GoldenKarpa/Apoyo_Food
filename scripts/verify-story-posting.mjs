/**
 * Slice 15's done-when, driven for real: "post -> appears with the
 * freshness-dot treatment -> viewer works with gestures -> expiry sweep
 * clears an aged post -> highlight persists on the Menu shelf; dashboard
 * shows correct counts for a real seller's real listings."
 *
 * Six clauses, six sections below, in the same order. This is a browser pass
 * because every one of them is a claim about a rendered page or a real
 * session — the create/delete/highlight Server Actions cannot be called from
 * a plain Node script at all (`next/headers` throws outside a request scope,
 * the same limitation every ownership-checked action in this codebase has
 * had since Slice 10).
 *
 * ⚠ Run against a PRODUCTION build (`npm run build && npm start`) — see
 * `verify-onboarding.mjs`'s own note for why (the `__Secure-` cookie naming
 * and Chromium's cookie-acceptance quirk, reused verbatim here).
 *
 *   node scripts/verify-story-posting.mjs [--base http://localhost:3012]
 */

import { createRequire } from "node:module";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import sharp from "sharp";

// Uploads root, duplicated inline rather than imported from `lib/storage.ts`
// — the same reason `verify-onboarding.mjs` already does this: a plain
// `.mjs` run by node cannot import a project `.ts` module.
const uploadsBase = () => process.env.UPLOADS_BASE_PATH ?? path.join(process.cwd(), "uploads");

/**
 * Writes real (tiny, non-image) bytes at an EXACT storage key — used for the
 * backdated story fixtures below, which are inserted directly via Prisma
 * rather than through the real upload pipeline (waiting 24h for a genuinely
 * aged post isn't practical). Without a real file backing the key, the page
 * that renders it 404s the image request, which is a real console error this
 * script would otherwise (wrongly) blame on the app rather than on its own
 * fixture being incomplete.
 */
async function writeFakeStoryFile(key) {
  const target = path.join(uploadsBase(), ...key.split("/"));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from("fixture"));
}

/**
 * `resetFixtures()` only deletes DATABASE rows (it runs a plain
 * `foodStory.deleteMany`, not the `deleteStory` Server Action, for the same
 * "can't call it outside a request scope" reason everything else here is a
 * browser pass). The EPHEMERAL fixture's files are already gone — the sweep
 * itself deletes them, which is exactly what this script is proving — but the
 * HIGHLIGHTED one survives the sweep by design and would leave 3 orphaned
 * files on disk when its row is later deleted by cleanup. This is the
 * deliberate, explicit stand-in for that one row's file cleanup.
 */
async function deleteFakeStoryFile(key) {
  const target = path.join(uploadsBase(), ...key.split("/"));
  await fs.unlink(target).catch(() => {});
}

// ⚠ This is a plain `.mjs` run by node — it cannot import `lib/sweep.ts` or
// any other project `.ts` module directly (the Slice 3/5/13 finding, applied
// again here: ESM resolves bare/relative specifiers from the file's own
// location and node has no TypeScript loader of its own). Rather than
// duplicate the sweep's logic inline, this shells out to the REAL CLI entry
// point (`scripts/sweep.ts --once`) via `execFileSync` — a stronger proof
// than a reimplementation, since it is the exact command a cron/PM2 restart
// would run in production, not a copy of what it does.
function runSweepOnce() {
  // ⚠ `shell: true` — on Windows `npx` resolves to `npx.cmd`, which
  // `execFileSync` cannot exec directly without going through a shell (a
  // plain ENOENT with no further detail otherwise).
  execFileSync("npx", ["tsx", "scripts/sweep.ts", "--once"], { stdio: "pipe", shell: true });
}

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

const SELLER_USER_ID = "food-s15-seller";
const SELLER_SLUG = "_verify-s15-e2e-seller";
const BUYER_USER_ID = "food-s15-buyer";
const KITCHEN_NAME = "Verify Slice 15 Kitchen";
const LISTING_TITLE = "Verify Slice 15 Dish";

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
  await prisma.foodStoryView.deleteMany({ where: { story: { seller: { userId: SELLER_USER_ID } } } });
  await prisma.foodStory.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodStoryHighlight.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodDemandEvent.deleteMany({
    where: { sellerId: (await prisma.foodSeller.findUnique({ where: { userId: SELLER_USER_ID }, select: { id: true } }))?.id ?? "none" },
  });
  await prisma.foodListing.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodSeller.deleteMany({ where: { userId: { in: [SELLER_USER_ID] } } });
}

async function run() {
  await resetFixtures();

  const seller = await prisma.foodSeller.create({
    data: { userId: SELLER_USER_ID, slug: SELLER_SLUG, displayName: KITCHEN_NAME, status: "ACTIVE", followerCount: 4 },
  });
  const listing = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: `${SELLER_SLUG}-dish`,
      title: LISTING_TITLE,
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "QUOTE",
      active: true,
    },
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([await mintCookie(SELLER_USER_ID)]);
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // ==========================================================================
  section("Post — photo, caption, linked listing, in a few taps");
  // ==========================================================================
  await page.goto(`${BASE}/food/stories`, { waitUntil: "networkidle" });

  const photoA = await jpegFixture({ r: 200, g: 140, b: 60 });
  await page.setInputFiles("#story-photo-file", { name: "fresh.jpg", mimeType: "image/jpeg", buffer: photoA });
  await page.getByText("Elegir otra foto").waitFor({ timeout: 15000 }); // upload finished, form revealed
  await page.getByLabel("Descripción (opcional)").fill("Recién horneado esta mañana.");
  await page.getByLabel("Enlazar un plato (opcional)").selectOption({ label: LISTING_TITLE });
  await page.getByRole("button", { name: "Publicar" }).click();
  await page.waitForTimeout(2000);

  let stories = await prisma.foodStory.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "asc" } });
  check(stories.length === 1, "a FoodStory row now exists", stories.length);
  check(stories[0]?.linkedListingId === listing.id, "…linked to the chosen listing");
  check(stories[0]?.pathThumb.startsWith("stories/"), "…as a pipeline storage key", stories[0]?.pathThumb);
  const sellerAfterPost = await prisma.foodSeller.findUniqueOrThrow({ where: { id: seller.id } });
  check(sellerAfterPost.lastStoryAt !== null, "…and lastStoryAt was bumped (Part E2: presence, not demand)");

  // A second post, photo only — gives the viewer two slides to advance between.
  const photoB = await jpegFixture({ r: 90, g: 70, b: 130 });
  await page.setInputFiles("#story-photo-file", { name: "fresh2.jpg", mimeType: "image/jpeg", buffer: photoB });
  await page.getByText("Elegir otra foto").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Publicar" }).click();
  await page.waitForTimeout(2000);

  stories = await prisma.foodStory.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "asc" } });
  check(stories.length === 2, "a second post creates a second row (no cap hit)", stories.length);
  const [firstStory, secondStory] = stories;

  const activeListText = await page.locator("body").innerText();
  check(activeListText.includes("Recién horneado esta mañana."), "the active-posts list shows the caption");
  check(activeListText.includes(LISTING_TITLE), "…and the linked listing's title");

  // ==========================================================================
  section("Assign to a Menu shelf — create/name/assign, the brief's own three verbs");
  // ==========================================================================
  await page.getByLabel("Nombre del nuevo estante").fill("Especialidades");
  await page.getByRole("button", { name: "Crear estante" }).click();
  await page.waitForTimeout(1500);

  const highlight = await prisma.foodStoryHighlight.findFirstOrThrow({ where: { sellerId: seller.id } });
  check(highlight.title === "Especialidades", "the shelf was created with the given name");

  // Assign the FIRST post (the one with the caption + linked dish) to it via
  // the active-posts list's per-row select.
  //
  // ⚠ Scoped by its own caption text, NOT `.first()` — the list orders newest
  // first (`activeStoriesForSeller`'s own `orderBy: createdAt desc`), so the
  // SECOND post (no caption) renders first in the DOM. `.first()` would have
  // silently assigned the wrong story's dropdown while the assertion below
  // kept checking the right one — a mismatch that would have looked like a
  // passing test for the wrong reason.
  const firstStoryRow = page.locator("li").filter({ hasText: "Recién horneado esta mañana." });
  await firstStoryRow.getByLabel("Añadir al estante").selectOption({ label: "Especialidades" });
  await page.waitForTimeout(1200);

  const assigned = await prisma.foodStory.findUnique({ where: { id: firstStory.id } });
  check(assigned?.highlightId === highlight.id, "the first post is now on the shelf", assigned?.highlightId);

  // ==========================================================================
  section("Freshness-dot treatment — the public profile");
  // ==========================================================================
  const profilePage = await page.request.get(`${BASE}/sellers/${SELLER_SLUG}`);
  check(profilePage.status() === 200, "the seller's public profile is reachable", profilePage.status());
  const profileHtml = await profilePage.text();
  check(profileHtml.includes("Posted to Fresh Today"), "…carries the freshness-dot's accessible label");
  check(profileHtml.includes("Especialidades"), "…and the new Menu shelf appears");
  check((profileHtml.match(/\/api\/media\/stories\//g) ?? []).length >= 1, "…serving the story photo through the media pipeline");

  // ==========================================================================
  section("The viewer works with gestures");
  // ==========================================================================
  const viewerPage = await context.newPage();
  const viewerErrors = [];
  viewerPage.on("pageerror", (e) => viewerErrors.push(String(e)));
  await viewerPage.goto(`${BASE}/stories/${SELLER_SLUG}`, { waitUntil: "networkidle" });

  const segments = viewerPage.locator("div.flex.gap-1 > div.h-1");
  check((await segments.count()) === 2, "two progress-bar segments — one per active post", await segments.count());

  const viewport = viewerPage.viewportSize();
  const firstSlideSrc = await viewerPage.locator("img").first().getAttribute("src");
  // Tap the RIGHT half — Part E2's own "tap-advance" zoning.
  await viewerPage.mouse.click(viewport.width - 20, viewport.height / 2);
  await viewerPage.waitForTimeout(300);
  const secondSlideSrc = await viewerPage.locator("img").first().getAttribute("src");
  check(
    !!secondSlideSrc && secondSlideSrc !== firstSlideSrc,
    "tapping the right half genuinely advanced to a DIFFERENT slide, not just re-rendered the same one",
    { firstSlideSrc, secondSlideSrc },
  );

  await viewerPage.keyboard.press("Escape");
  await viewerPage.waitForTimeout(500);
  check(viewerPage.url().includes(`/sellers/${SELLER_SLUG}`) || !viewerPage.url().includes("/stories/"), "Escape closes the viewer", viewerPage.url());
  await viewerPage.close();

  // View-tracking, as a different (buyer) session — FoodStoryView + the
  // STORY_VIEW demand event both fire per Slice 11's own asymmetry.
  const buyerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await buyerContext.addCookies([await mintCookie(BUYER_USER_ID, "en")]);
  const buyerPage = await buyerContext.newPage();
  await buyerPage.goto(`${BASE}/stories/${SELLER_SLUG}`, { waitUntil: "networkidle" });
  await buyerPage.waitForTimeout(1500); // recordStoryView fires per slide as it becomes active
  await buyerContext.close();

  const viewRows = await prisma.foodStoryView.findMany({ where: { userId: BUYER_USER_ID } });
  check(viewRows.length >= 1, "an authenticated buyer's view was recorded (FoodStoryView)", viewRows.length);

  // ==========================================================================
  section("Expiry sweep clears an aged post -> highlight persists on the Menu shelf");
  // ==========================================================================
  // A third post, backdated well past its 24h window, WITHOUT a highlight —
  // the sweep's real deletion target. Direct insert: waiting 24h isn't
  // practical, and this is exactly the shape `verify-sweep.ts` already proves
  // at the domain level; here it is proven through the actual rendered pages.
  // ⚠ Real files are written for both fixtures' keys (`writeFakeStoryFile`) —
  // a DB row with no backing file 404s the very first time a page tries to
  // render it, which is a real console error caused by the FIXTURE being
  // incomplete, not by the app. First run of this script shipped without
  // this and caught it as a false "app is broken" failure.
  const oldEphemeralPaths = {
    pathThumb: "stories/verify-s15-old-thumb.webp",
    pathCard: "stories/verify-s15-old-card.webp",
    pathFull: "stories/verify-s15-old-full.webp",
  };
  const oldHighlightedPaths = {
    pathThumb: "stories/verify-s15-oldh-thumb.webp",
    pathCard: "stories/verify-s15-oldh-card.webp",
    pathFull: "stories/verify-s15-oldh-full.webp",
  };
  await Promise.all(
    [...Object.values(oldEphemeralPaths), ...Object.values(oldHighlightedPaths)].map(writeFakeStoryFile),
  );

  const oldEphemeral = await prisma.foodStory.create({
    data: {
      sellerId: seller.id,
      ...oldEphemeralPaths,
      blurDataUrl: "data:image/jpeg;base64,x",
      createdAt: new Date(Date.now() - 48 * 3_600_000),
      expiresAt: new Date(Date.now() - 24 * 3_600_000),
    },
  });
  // A SECOND old row, this one highlighted — proves the exemption through the
  // same pass, matching the done-when's own single sentence about both.
  const oldHighlighted = await prisma.foodStory.create({
    data: {
      sellerId: seller.id,
      ...oldHighlightedPaths,
      blurDataUrl: "data:image/jpeg;base64,x",
      createdAt: new Date(Date.now() - 48 * 3_600_000),
      expiresAt: new Date(Date.now() - 24 * 3_600_000),
      highlightId: highlight.id,
    },
  });

  runSweepOnce();

  const [ephemeralGone, highlightedSurvived] = await Promise.all([
    prisma.foodStory.findUnique({ where: { id: oldEphemeral.id } }),
    prisma.foodStory.findUnique({ where: { id: oldHighlighted.id } }),
  ]);
  check(ephemeralGone === null, "the aged EPHEMERAL post is gone from the database");
  check(highlightedSurvived !== null, "the aged HIGHLIGHTED post survives in the database");

  // The done-when's own finish line for this clause: what the SELLER'S OWN
  // shelf manager actually shows, not just what the database rows say.
  //
  // ⚠ Deliberately NOT the public profile page. `/sellers/[slug]` renders
  // only the highlight's SINGLE most-recent story as its cover photo (Slice
  // 11's own `take: 1, orderBy: createdAt desc`) — and `firstStory` (posted
  // live, moments ago, during this run) is far newer than the backdated
  // `oldHighlighted` row, so it would win the cover slot regardless of
  // whether the sweep's exemption worked at all. That made the public-profile
  // version of this assertion pass or fail for the wrong reason. The MANAGER
  // page (`highlightsForSeller`, no `take` limit) is where every story under
  // a shelf is actually enumerated, which is the real claim to prove.
  await page.goto(`${BASE}/food/stories`, { waitUntil: "networkidle" });
  const managerHtmlAfterSweep = await page.content();
  check(!managerHtmlAfterSweep.includes("verify-s15-old-thumb"), "the swept EPHEMERAL post is gone from the seller's own Active-now list too");
  check(
    managerHtmlAfterSweep.includes("verify-s15-oldh-thumb"),
    "…and the aged HIGHLIGHTED post still appears under its shelf in the manager, after the sweep ran",
  );

  // ==========================================================================
  section("Dashboard shows correct counts for a real seller's real listings");
  // ==========================================================================
  const expectedListingViews = 0; // this run never opened /meals/[slug] for this seller
  // ⚠ ONE, not two: the sweep section used to check a second /sellers/[slug]
  // fetch, but that assertion was replaced (see its own comment — the public
  // profile only shows a highlight's NEWEST story, which made that version of
  // the check pass or fail for the wrong reason). Removing the fetch left
  // this constant stale at first — caught by the assertion actually failing
  // (1 logged, 2 expected), not by re-reading the diff.
  const expectedProfileViews = 1; // the single page.request.get(/sellers/[slug]) call above
  await prisma.foodSave.create({ data: { userId: "food-s15-saver", listingId: listing.id } });

  await page.goto(`${BASE}/food`, { waitUntil: "networkidle" });
  const dashboardHtml = await page.locator("body").innerText();

  const realStats = {
    views: await prisma.foodDemandEvent.count({ where: { sellerId: seller.id, kind: { in: ["PROFILE_VIEW", "LISTING_VIEW"] } } }),
    saves: await prisma.foodSave.count({ where: { listing: { sellerId: seller.id } } }),
    follows: (await prisma.foodSeller.findUniqueOrThrow({ where: { id: seller.id } })).followerCount,
  };
  check(realStats.views >= expectedProfileViews + expectedListingViews, "at least the expected PROFILE_VIEW events were logged", realStats);
  check(dashboardHtml.includes(String(realStats.views)), "the dashboard's Views tile shows the real count", realStats.views);
  check(dashboardHtml.includes(String(realStats.saves)), "…the Saves tile shows the real count (1)", realStats.saves);
  check(dashboardHtml.includes(String(realStats.follows)), "…the Follows tile shows the real, denormalized followerCount (4)", realStats.follows);

  check(consoleErrors.length === 0, "zero console/page errors on the seller surface", consoleErrors.slice(0, 3));
  check(viewerErrors.length === 0, "…and zero on the buyer-facing viewer", viewerErrors.slice(0, 3));

  await context.close();
  await browser.close();

  // The one fixture the sweep was correct NOT to delete — see the note on
  // `deleteFakeStoryFile` for why this is separate from `resetFixtures()`.
  await Promise.all(Object.values(oldHighlightedPaths).map(deleteFakeStoryFile));

  await resetFixtures();
  const leftover = await prisma.foodSeller.count({ where: { userId: SELLER_USER_ID } });
  check(leftover === 0, "self-cleaning: the test seller and everything under it is removed");

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
