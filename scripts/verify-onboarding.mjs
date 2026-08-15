/**
 * Slice 13's done-when, driven for real: "a fresh user completes onboarding
 * locally end to end and lands on the dashboard as PENDING; the dashboard shell
 * correctly renders the PENDING state (not an unauthorized error)."
 *
 * This is a browser pass, not a unit test, because every interesting claim in
 * that sentence is about a rendered page and a real session:
 *   - the Server Actions cannot be called from a plain Node script at all
 *     (`next/headers` throws outside a request scope — the same limitation
 *     Slices 10 and 11 recorded), so this is the ONLY way to exercise them;
 *   - "lands on the dashboard as PENDING" is a claim about what a seller sees;
 *   - and skippable-and-resumable is only true if closing the tab and coming
 *     back actually resumes, which no assertion about a pure function can show.
 *
 * ⚠ Run against a PRODUCTION build (`npm run build && npm start`), not
 * `next dev`. `next start` forces NODE_ENV=production, which changes the
 * session cookie's name to `__Secure-authjs.session-token` AND the JWE salt
 * derived from it — a session minted for dev naming decodes as signed-out
 * against a production build, silently, with nothing logged (Slice 3's
 * reproduced cookie-name trap). Chromium treats http://localhost as a secure
 * context, which is what lets a `__Secure-` cookie be set over plain HTTP here.
 *
 * ⚠ Needs a LOCAL portal-web on a THROWAWAY identity database, with a
 * `food-app` entry in its ECOSYSTEM_SERVICE_TOKENS. Never point this at
 * production — it creates memberships. The script refuses an apoyolime.com
 * ecosystem host outright.
 *
 *   node scripts/verify-onboarding.mjs [--base http://localhost:3012] [--user food-s13-seller]
 */

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import sharp from "sharp";
import piexif from "piexifjs";

/**
 * Uploads root and key resolution, duplicated from `lib/storage.ts` rather than
 * imported: this is a plain `.mjs` run by node, which cannot import a `.ts`
 * module. Deliberately the SMALLEST possible duplication — just enough to read
 * a stored file back off disk and check its bytes.
 */
const uploadsBase = () => process.env.UPLOADS_BASE_PATH ?? path.join(process.cwd(), "uploads");
const storagePath = (key) => path.join(uploadsBase(), ...key.split("/"));

const SHARED_TOOL = "C:/Users/Karpa/.claude/tools/browser-testing";
// ESM resolves bare specifiers from the FILE's location, so playwright — which
// lives only in the shared tool — has to be required through an anchor there
// (the Slice 3 / Slice 5 finding, applied rather than rediscovered).
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
const USER_ID = arg("user", "food-s13-seller");
const OTHER_USER_ID = arg("other", "food-s13-intruder");
const KITCHEN_NAME = "Cocina de Doña Martínez";
const EXPECTED_SLUG = "cocina-de-dona-martinez";

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

/** A real JPEG carrying a real GPS EXIF block — a photographed home kitchen. */
async function gpsJpeg() {
  const plain = await sharp({
    create: { width: 900, height: 900, channels: 3, background: { r: 190, g: 120, b: 70 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  const exif = {
    "0th": {},
    Exif: {},
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      // 10°39'N 61°31'W — Port of Spain. The point of the fixture is that it is
      // a REAL location that would identify a real kitchen.
      [piexif.GPSIFD.GPSLatitude]: [[10, 1], [39, 1], [0, 1]],
      [piexif.GPSIFD.GPSLongitudeRef]: "W",
      [piexif.GPSIFD.GPSLongitude]: [[61, 1], [31, 1], [0, 1]],
    },
  };
  const withExif = piexif.insert(
    piexif.dump(exif),
    `data:image/jpeg;base64,${plain.toString("base64")}`,
  );
  return Buffer.from(withExif.split(",")[1], "base64");
}

/** APP1/EXIF marker scan over raw stored bytes — never sharp's own reader. */
function hasExifBytes(buffer) {
  if (buffer.includes(Buffer.from("Exif\0\0", "binary"))) return true;
  // WEBP stores EXIF in a chunk with the literal FourCC "EXIF".
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.includes(Buffer.from("EXIF"))) return true;
  return false;
}

async function mintCookie(userId, locale = "es") {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required (see .env.local)");
  // Production naming, because the server under test is a production build.
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
      // ⚠ EMPTY on purpose. This reproduces the real staleness case: a token
      // issued before this vertical minted its membership. Every guard in this
      // flow has to read the ecosystem API, never this claim.
      memberships: [],
      emailVerified: true,
    },
  });
  // ⚠ The `domain`/`path` form, NOT `{ url, secure: true }`. Chromium's CDP
  // rejects a `__Secure-`-prefixed cookie handed to it with an http:// URL
  // outright ("Invalid cookie fields") — it validates the prefix against the
  // URL's scheme, not against localhost's trustworthy-origin status. Given a
  // bare domain it accepts the cookie, and then SENDS it over http://localhost
  // because localhost *is* a secure context by Chrome's own rules. Two
  // different code paths with two different answers about the same cookie.
  return {
    name,
    value,
    domain: new URL(BASE).hostname,
    path: "/",
    secure: true,
    sameSite: "Lax",
  };
}

async function ecosystemMemberships(userId) {
  const base = process.env.ECOSYSTEM_API_BASE_URL;
  const token = process.env.ECOSYSTEM_SERVICE_TOKEN;
  if (!base || !token) return null;
  if (base.includes("apoyolime.com")) {
    throw new Error("refusing to run against a real ecosystem host — use a local portal-web");
  }
  const res = await fetch(`${base}/api/ecosystem/v1/users/${userId}/memberships`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()).memberships;
}

async function resetSeller(userId) {
  const seller = await prisma.foodSeller.findUnique({ where: { userId } });
  if (!seller) return;
  await prisma.foodSellerPhoto.deleteMany({ where: { sellerId: seller.id } });
  await prisma.foodSeller.delete({ where: { id: seller.id } });
}

async function run() {
  if (process.env.ECOSYSTEM_API_BASE_URL?.includes("apoyolime.com")) {
    throw new Error("refusing to run against a real ecosystem host");
  }

  // A genuinely fresh account is the premise of the done-when, so the run
  // starts by making it true rather than assuming it.
  await resetSeller(USER_ID);
  await resetSeller(OTHER_USER_ID);
  check((await prisma.foodSeller.findUnique({ where: { userId: USER_ID } })) === null, "setup: the test account has no kitchen");

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];

  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // ==========================================================================
  section("Anonymous seller surface");
  // ==========================================================================
  await page.goto(`${BASE}/food`, { waitUntil: "networkidle" });
  const anonBody = await page.locator("body").innerText();
  check(/Inicia sesión/.test(anonBody), "anonymous /food shows the signed-out notice", anonBody.slice(0, 90));
  // ⚠ The ecosystem rule (settled during Apparel's build, applied at Slices
  // 10/11): a vertical must never surface another vertical's URL as a redirect
  // target. So the notice states the situation and offers no link at all.
  const anonLinks = await page.locator("main a").count();
  check(anonLinks === 0, "…and offers no sign-in link or redirect", anonLinks);
  check((await page.locator("nav[aria-label]").count()) === 0, "…and renders no workspace nav");

  const anonUpload = await page.request.post(`${BASE}/api/seller/media`, {
    multipart: { kind: "avatar", file: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } },
  });
  check(anonUpload.status() === 401, "anonymous POST /api/seller/media is 401", anonUpload.status());

  // ==========================================================================
  section("Registration");
  // ==========================================================================
  await context.addCookies([await mintCookie(USER_ID)]);
  await page.goto(`${BASE}/food`, { waitUntil: "networkidle" });

  const lang = await page.getAttribute("html", "lang");
  check(lang === "es", "the seller surface defaults to Spanish", lang);

  const ctaVisible = await page.getByRole("link", { name: /Empezar a vender/i }).isVisible();
  check(ctaVisible, "a signed-in non-seller sees the become-a-seller CTA (§6b FOOD toggle is on)");

  await page.getByRole("link", { name: /Empezar a vender/i }).click();
  await page.waitForURL("**/food/setup");
  const onboardBody = await page.locator("body").innerText();
  check(/dirección/i.test(onboardBody), "the registration page states the address-privacy rule up front (Part G)");

  await page.getByLabel(/¿Cómo se llama tu cocina\?/).fill(KITCHEN_NAME);
  await page.getByRole("button", { name: /Crear mi cocina/i }).click();
  await page.waitForURL("**/food/profile/setup**", { timeout: 15000 });

  const created = await prisma.foodSeller.findUnique({ where: { userId: USER_ID } });
  check(created !== null, "a FoodSeller row now exists");
  check(created?.status === "PENDING", "…as PENDING", created?.status);
  check(created?.displayName === KITCHEN_NAME, "…carrying the display name verbatim, accents intact", created?.displayName);
  // ⚠ NFD folding, on the default case for a Spanish-first surface.
  check(created?.slug === EXPECTED_SLUG, "…with an accent-folded slug, not one with the letters deleted", created?.slug);

  const memberships = await ecosystemMemberships(USER_ID);
  check(memberships !== null, "the ecosystem API answered (a local portal-web is configured)");
  check(
    !!memberships?.some((m) => m.vertical === "FOOD" && m.role === "PROVIDER" && m.status === "ACTIVE"),
    "…and a REAL (FOOD, PROVIDER) membership was minted at submit",
    memberships,
  );

  // Idempotency: the seller re-visits the registration URL by hand.
  await page.goto(`${BASE}/food/setup`, { waitUntil: "networkidle" });
  check(page.url().endsWith("/food"), "re-visiting /food/setup redirects an existing seller to their workspace", page.url());
  check(
    (await prisma.foodSeller.count({ where: { userId: USER_ID } })) === 1,
    "…and no second kitchen was created",
  );

  // ==========================================================================
  section("Guided setup — media step (the Part G-critical one)");
  // ==========================================================================
  await page.goto(`${BASE}/food/profile/setup`, { waitUntil: "networkidle" });
  const stepHeading = await page.locator("h2").first().innerText();
  check(/Foto de perfil/i.test(stepHeading), "a brand-new seller resumes at step 1, the profile photo", stepHeading);
  // ⚠ The bare URL redirects to the pinned one. Without that, completing a step
  // in place would swap the page to the next step underneath the seller.
  check(page.url().endsWith("/food/profile/setup?step=photo"), "…and the URL is pinned to that step, not left bare", page.url());

  const fixture = await gpsJpeg();
  check(hasExifBytes(fixture), "the fixture genuinely carries GPS EXIF BEFORE upload (otherwise the strip proves nothing)");

  await page.setInputFiles("#seller-photo-avatar", {
    name: "kitchen.jpg",
    mimeType: "image/jpeg",
    buffer: fixture,
  });
  await page.waitForTimeout(2500);

  const withAvatar = await prisma.foodSeller.findUnique({ where: { userId: USER_ID } });
  check(withAvatar?.profileImageThumb !== null, "the avatar landed on the seller's own row");
  check(
    !!withAvatar?.profileImageThumb?.startsWith("sellers/") && withAvatar.profileImageThumb.endsWith("-thumb.webp"),
    "…as a pipeline storage key, not a raw upload",
    withAvatar?.profileImageThumb,
  );
  check(!!withAvatar?.profileImageBlur?.startsWith("data:image/"), "…with a real blur placeholder");

  for (const key of [withAvatar?.profileImageThumb, withAvatar?.profileImageCard, withAvatar?.profileImageFull]) {
    const resolved = storagePath(key);
    const bytes = await fs.readFile(resolved);
    check(!hasExifBytes(bytes), `EXIF/GPS is absent from the stored variant ${path.basename(resolved)}`);
  }
  // The original bytes must exist nowhere on disk — "no raw uploads anywhere".
  const walked = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else walked.push(full);
    }
  }
  await walk(uploadsBase());
  let rawFound = false;
  for (const file of walked) {
    const bytes = await fs.readFile(file);
    if (bytes.equals(fixture)) rawFound = true;
  }
  check(!rawFound, "the uploaded bytes were never written to disk unprocessed");

  // ==========================================================================
  section("Guided setup — skipping, saving and resuming");
  // ==========================================================================
  await page.getByRole("link", { name: /Continuar/i }).first().click();
  await page.waitForURL("**/setup?step=cover");

  // ⚠ SKIP the cover deliberately — it is the step this run comes back to, and
  // it is what makes "resumable" a claim about data rather than about a wizard.
  await page.getByRole("link", { name: /Saltar por ahora/i }).first().click();
  await page.waitForURL("**/setup?step=bio");

  const BIO = "Cocino comida trinitaria en casa desde hace quince años: pastelón, pelau y bake and shark.";
  await page.getByLabel("Tu historia").fill(BIO);
  await page.getByRole("button", { name: /^Continuar$/ }).click();
  await page.waitForURL("**/setup?step=areas");
  check((await prisma.foodSeller.findUnique({ where: { userId: USER_ID } }))?.bio === BIO, "the bio saved on Continue");

  // Areas: the region map's `max` prop, reserved for this step back at Slice 9.
  for (const label of ["Centro", "Suroeste"]) {
    const button = page.getByRole("button", { name: new RegExp(`^${label}`) });
    if ((await button.count()) > 0 && (await button.first().isEnabled())) await button.first().click();
  }
  const selectedCount = await page.locator('button[aria-pressed="true"]').count();
  check(selectedCount >= 1 && selectedCount <= 3, "the area picker selected 1-3 regions", selectedCount);
  // Every unselected region is disabled once three are chosen — the cap is an
  // affordance here AND re-checked server-side (a CHECK violation would 500).
  await page.getByRole("button", { name: /^Continuar$/ }).click();
  await page.waitForURL("**/setup?step=languages");
  const withAreas = await prisma.foodSeller.findUnique({ where: { userId: USER_ID } });
  check(withAreas.areas.length >= 1 && withAreas.areas.length <= 3, "…and they saved", withAreas.areas);

  await page.getByRole("button", { name: /^Español$/ }).click();
  await page.getByRole("button", { name: /^Continuar$/ }).click();
  await page.waitForURL("**/setup?step=specialties");
  check((await prisma.foodSeller.findUnique({ where: { userId: USER_ID } })).languages.includes("es"), "languages saved");

  // Enter-to-add, because that is the keypress a phone keyboard invites.
  await page.getByLabel("Añadir una especialidad").fill("pastelón");
  await page.keyboard.press("Enter");
  await page.getByLabel("Añadir una especialidad").fill("pelau");
  await page.keyboard.press("Enter");
  check(page.url().includes("step=specialties"), "Enter adds a specialty instead of submitting the form");
  await page.getByRole("button", { name: /^Continuar$/ }).click();
  await page.waitForURL("**/setup?step=fulfillment");
  const withSpecialties = await prisma.foodSeller.findUnique({ where: { userId: USER_ID } });
  check(
    withSpecialties.specialties.includes("pastelón") && withSpecialties.specialties.includes("pelau"),
    "…and both specialties saved with their accents",
    withSpecialties.specialties,
  );

  await page.getByRole("button", { name: /^Recogida$/ }).first().click();
  await page.getByRole("button", { name: /^Continuar$/ }).click();
  await page.waitForURL("**/setup?step=gallery");
  check(
    (await prisma.foodSeller.findUnique({ where: { userId: USER_ID } })).fulfillmentModes.length >= 1,
    "a fulfilment mode saved",
  );

  await page.setInputFiles("#seller-gallery-file", {
    name: "gallery.jpg",
    mimeType: "image/jpeg",
    buffer: fixture,
  });
  await page.waitForTimeout(2500);
  const galleryCount = await prisma.foodSellerPhoto.count({ where: { seller: { userId: USER_ID } } });
  check(galleryCount === 1, "a gallery photo landed as a FoodSellerPhoto row", galleryCount);

  // ⚠ THE RESUME CLAIM. Re-entering the wizard with no ?step must land on the
  // one step that was skipped — not step 1, and not the end.
  await page.goto(`${BASE}/food/profile/setup`, { waitUntil: "networkidle" });
  const resumeHeading = await page.locator("h2").first().innerText();
  check(/Foto de portada/i.test(resumeHeading), "re-entering the wizard resumes at the SKIPPED step, not step 1", resumeHeading);
  check(page.url().endsWith("step=cover"), "…and pins the URL to it", page.url());

  // …and every step stays directly reachable, which is the other half of it.
  await page.goto(`${BASE}/food/profile/setup?step=bio`, { waitUntil: "networkidle" });
  const bioValue = await page.getByLabel("Tu historia").inputValue();
  check(bioValue === BIO, "…and jumping back to a finished step shows what was saved, re-read from the database");

  // ==========================================================================
  section("The dashboard as PENDING — the done-when");
  // ==========================================================================
  await page.goto(`${BASE}/food`, { waitUntil: "networkidle" });
  const dash = await page.locator("body").innerText();
  check(!/unauthorized|no autorizado|403|404/i.test(dash), "the PENDING dashboard is NOT an unauthorized error");
  check(/En revisión/.test(dash), "…it renders the PENDING state explicitly", dash.slice(0, 120));
  check(dash.includes(KITCHEN_NAME), "…named as the seller's own kitchen");
  check(/Lo que falta/.test(dash), "…with the what's-left checklist pointing at next actions");
  check((await page.locator('nav[aria-label] a[href="/food/profile"]').count()) > 0, "…and the workspace nav is present");
  // Unbuilt destinations are stubs, never missing nav items (conventions block).
  // As of Slice 17, every seller nav destination is real — none left to check
  // for PRESENCE here.
  const stubs = await page.$$eval("[data-coming-soon]", (els) => els.map((e) => e.getAttribute("data-coming-soon")));
  // ⚠ Slice 14 retired `sellerListings`, Slice 15 retired `sellerStories`,
  // Slice 17 retired `sellerOrders` — all real routes now, checked for
  // ABSENCE, the same regression guard `verify-a11y.mjs` applies to
  // `becomeSeller`'s Slice 13 retirement.
  check(!stubs.includes("sellerListings"), '…and "sellerListings" is retired (Slice 14) — the nav links to /food/listings for real');
  check(!stubs.includes("sellerStories"), '…and "sellerStories" is retired (Slice 15) — the nav links to /food/stories for real');
  check(!stubs.includes("sellerOrders"), '…and "sellerOrders" is retired (Slice 17) — the nav links to /food/orders for real');
  const publicLink = await page.locator(`a[href="/sellers/${EXPECTED_SLUG}"]`).count();
  check(publicLink === 0, "a PENDING seller is NOT offered a link to their public profile (it would 404)");

  // The visibility rule, from the buyer side.
  const pendingProfile = await page.request.get(`${BASE}/sellers/${EXPECTED_SLUG}`);
  check(pendingProfile.status() === 404, "…and that public profile really does 404 while PENDING", pendingProfile.status());

  // ==========================================================================
  section("Mobile layout on the seller surface (390px)");
  // ==========================================================================
  // ⚠ `verify-a11y.mjs` cannot reach these pages: it drives every route
  // anonymously, and the whole seller workspace is behind a session. So the two
  // checks that break a phone surface outright are made here instead of being
  // assumed. Full contrast auditing stays with that script, on the buyer
  // surface it can actually reach — Phase 2's own bar is "working", not
  // "visually finished" (BUILD_SLICES.md conventions).
  for (const route of ["/food", "/food/profile/setup?step=areas", "/food/profile"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // Spanish runs ~30% longer than English (Part F3) and this surface DEFAULTS
    // to Spanish, so overflow is the likely failure, not the exotic one.
    check(overflow <= 1, `${route}: no horizontal overflow at 390px`, overflow);

    const undersized = await page.$$eval("a, button, input[type=file]", (els) =>
      els
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          // Tailwind's sr-only clip, as used by the hidden file inputs.
          if (style.clipPath === "inset(50%)" || style.clip === "rect(0px, 0px, 0px, 0px)") return false;
          return r.height < 44 || r.width < 24;
        })
        .map((el) => `${el.tagName}:${(el.textContent || "").trim().slice(0, 24)}`),
    );
    check(undersized.length === 0, `${route}: every visible control clears the 44px tap target`, undersized);
  }

  // ==========================================================================
  section("Approved (what Slice 16 will do) — the profile reaches buyers");
  // ==========================================================================
  await prisma.foodSeller.update({ where: { userId: USER_ID }, data: { status: "ACTIVE" } });
  const activeProfile = await page.request.get(`${BASE}/sellers/${EXPECTED_SLUG}`);
  check(activeProfile.status() === 200, "an ACTIVE seller's public profile is reachable", activeProfile.status());
  const html = await activeProfile.text();
  check(html.includes(KITCHEN_NAME), "…showing the name entered at registration");
  check(html.includes("pastelón"), "…the specialties entered in setup");
  check(/\/api\/media\/sellers\//.test(html), "…and the photo, served through the media pipeline's own route");
  await page.goto(`${BASE}/food`, { waitUntil: "networkidle" });
  check(
    (await page.locator(`a[href="/sellers/${EXPECTED_SLUG}"]`).count()) > 0,
    "…and the dashboard now DOES offer the public-profile link",
  );

  // ==========================================================================
  section("Ownership — a second account cannot touch this kitchen");
  // ==========================================================================
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await other.addCookies([await mintCookie(OTHER_USER_ID)]);
  const otherPage = await other.newPage();
  const otherUpload = await otherPage.request.post(`${BASE}/api/seller/media`, {
    multipart: { kind: "avatar", file: { name: "x.jpg", mimeType: "image/jpeg", buffer: fixture } },
  });
  check(otherUpload.status() === 401, "a signed-in NON-seller cannot upload seller media", otherUpload.status());
  const victim = await prisma.foodSeller.findUnique({ where: { userId: USER_ID } });
  check(victim.profileImageThumb === withAvatar.profileImageThumb, "…and the real seller's avatar is untouched");
  await otherPage.goto(`${BASE}/food/profile`, { waitUntil: "networkidle" });
  check(otherPage.url().endsWith("/food/setup"), "…and /food/profile sends them to registration, not into someone's editor", otherPage.url());
  await other.close();

  // ==========================================================================
  section("Buyer surface — the seller entry point is a real link now");
  // ==========================================================================
  const buyer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const buyerPage = await buyer.newPage();
  buyerPage.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  await buyerPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const footerCta = buyerPage.locator("footer a", { hasText: /Sell your food|Vende tu comida/ });
  check((await footerCta.count()) > 0, "the footer carries a real seller link");
  const href = await footerCta.first().getAttribute("href");
  check(/\/food\/onboarding$/.test(href), "…pointing at onboarding", href);
  const footerStubs = await buyerPage.$$eval("[data-coming-soon]", (els) => els.map((e) => e.getAttribute("data-coming-soon")));
  check(!footerStubs.includes("becomeSeller"), "…and the becomeSeller ComingSoon stub is gone (the one-line contract, in reverse)");
  await buyer.close();

  check(consoleErrors.length === 0, "zero console/page errors across the whole flow", consoleErrors.slice(0, 3));

  await context.close();
  await browser.close();

  // Leave the account as it started, so the run is repeatable.
  await resetSeller(USER_ID);
  check((await prisma.foodSeller.findUnique({ where: { userId: USER_ID } })) === null, "self-cleaning: the test kitchen is removed");

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
