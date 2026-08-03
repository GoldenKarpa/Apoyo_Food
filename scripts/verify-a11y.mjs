/**
 * Slice 7 verification: measured WCAG AA contrast, tap targets, locale parity,
 * layout overflow, motion and the `<ComingSoon>` sheet's real behaviour — all
 * read off the *rendered* DOM of a production build.
 *
 * Why measured rather than computed from the palette: Slice 1 computed contrast
 * from the token table by hand, which proves the tokens are sound and proves
 * nothing about what a component composited on screen. A chip can be given the
 * wrong ink; a label can inherit `ink-muted` onto a sunken surface; a button can
 * end up on a background nobody measured it against. Apparel shipped exactly
 * that class of bug for six slices — every individual token correct, the
 * composition wrong — and only found it by reading the browser's own values.
 *
 * So this walks every element owning a text node, resolves its *effective*
 * background by compositing the ancestor chain (alpha included), and computes
 * the WCAG 2.1 ratio against the correct bar for its measured size and weight.
 *
 * Run against `npm run build && npm start` — not `next dev`. Playwright comes
 * from the shared browser-testing tool (global CLAUDE.md); this repo takes no
 * Playwright dependency for one script, and `createRequire` is anchored to that
 * tool's own package.json because ESM resolves bare specifiers from the
 * *file's* location, not from `cwd` (the Slice 3/Slice 5 finding).
 *
 *   node scripts/verify-a11y.mjs [--base http://localhost:3012] [--shots <dir>]
 */

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

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

/** One phone width, one desktop width — the two forms the chrome has. */
const WIDTHS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

const LOCALES = ["en", "es"];

/**
 * A route turned into a legal filename.
 *
 * ⚠ Windows rejects `?`, `:`, `*` and friends in filenames, so `/search?q=…`
 * killed the whole audit mid-run with an ENOENT that reads like a missing
 * directory rather than an illegal name. Only surfaced once a route with a
 * query string was added to PAGES.
 */
function slugForFile(route) {
  return route.replace(/[/?=&:*"<>|]+/g, "_") || "_root";
}

/**
 * `/food` is included even though Phase 2 is where the seller surface gets its
 * design budget: an accessibility floor is not an aesthetic, and that surface
 * shares these tokens and this locale pill.
 */
const PAGES = [
  "/",
  "/browse",
  "/browse/sellers",
  "/categories/desserts",
  "/search?q=pastelon",
  // The zero-result state is a designed surface (Part E3), so it is audited
  // like any other rather than assumed to inherit the populated one's contrast.
  "/search?q=zzzznothing",
  // Slice 10 — a real, multi-photo, multi-category, ACTIVE-seller listing from
  // the demo seed, and the signed-out /saved state (no session cookie is set
  // anywhere in this script, so this is genuinely the anonymous render).
  "/meals/pastelon-de-platano",
  "/saved",
  // Slice 11 — a real ACTIVE seller with a Menu shelf highlight, active
  // listings and a gallery, and the full-screen Fresh Today viewer for the
  // same seller (they have an active story — confirmed against the seed).
  "/sellers/cocina-de-abuela",
  "/stories/cocina-de-abuela",
  // Slice 12 — the service worker's offline navigation fallback. Real
  // functional offline behaviour is `verify-pwa.mjs`'s job; this only checks
  // the page's own contrast/tap-targets/locale like every other route here.
  "/offline",
  "/style-guide",
  "/food",
];

let passes = 0;
const failures = [];

function check(ok, label, detail) {
  if (ok) {
    passes += 1;
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
  }
}

/** Injected into the page. Everything in here runs in the browser. */
function auditInPage() {
  const parseColor = (value) => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const [r, g, b] = parts;
    const a = parts.length > 3 ? parts[3] : 1;
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a: Number.isNaN(a) ? 1 : a };
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const luminance = ({ r, g, b }) => {
    const chan = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };

  const ratio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    // ⚠ `sr-only` content must NOT be measured for contrast. It is clipped to
    // nothing and exists solely for assistive tech, so its colours are whatever
    // it inherited — the first run of this script "failed" on the Fresh Today
    // dot's screen-reader label (ink inherited onto the teal dot, 2.51:1) while
    // nothing was on screen to read. Tailwind's `.sr-only` is the clip below;
    // the 1px size test above catches it too, and both are kept because a
    // future utility might use only one of the two mechanisms.
    if (style.clip === "rect(0px, 0px, 0px, 0px)") return false;
    if (style.clipPath === "inset(50%)") return false;
    return true;
  };

  /** Composite every ancestor background down to one opaque colour. */
  const effectiveBackground = (el) => {
    const layers = [];
    let node = el;
    let sawImage = false;
    while (node && node instanceof Element) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== "none") sawImage = true;
      const bg = parseColor(style.backgroundColor);
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 0.999) break;
      }
      node = node.parentElement;
    }
    if (layers.length === 0) return { colour: { r: 255, g: 255, b: 255, a: 1 }, sawImage };
    let result = layers[layers.length - 1];
    for (let i = layers.length - 2; i >= 0; i -= 1) result = over(layers[i], result);
    return { colour: result, sawImage };
  };

  const textNodes = [];
  const tapTargets = [];

  for (const el of document.querySelectorAll("body *")) {
    if (!isVisible(el)) continue;

    // Only elements owning a direct, non-whitespace text node — otherwise every
    // wrapper div is re-measured for the same string.
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();

    if (ownText) {
      const style = getComputedStyle(el);
      const fg = parseColor(style.color);
      const { colour: bg, sawImage } = effectiveBackground(el);
      if (fg) {
        const composited = fg.a < 1 ? over(fg, bg) : fg;
        const size = parseFloat(style.fontSize);
        const weight = Number(style.fontWeight) || 400;
        // WCAG "large text": >=24px, or >=18.66px when bold.
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        textNodes.push({
          text: ownText.slice(0, 60),
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === "string" ? el.className.slice(0, 110) : "",
          colour: style.color,
          background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          fontSize: size,
          fontWeight: weight,
          required: large ? 3 : 4.5,
          ratio: Math.round(ratio(composited, bg) * 100) / 100,
          overImage: sawImage,
        });
      }
    }

    const interactive =
      ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) ||
      el.getAttribute("role") === "button";
    if (interactive && el.getAttribute("aria-hidden") !== "true") {
      const rect = el.getBoundingClientRect();
      tapTargets.push({
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
        className: typeof el.className === "string" ? el.className.slice(0, 110) : "",
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      });
    }
  }

  return {
    lang: document.documentElement.lang,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    textNodes,
    tapTargets,
  };
}

/** Waits until no element on the page has a running CSS animation. */
async function settleAnimations(page) {
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("*")).every(
          (el) =>
            el.getAnimations().length === 0 ||
            el.getAnimations().every((a) => a.playState !== "running"),
        ),
      undefined,
      { timeout: 5000 },
    )
    .catch(() => {});
}

function assess(report, context, opts = {}) {
  const bad = report.textNodes.filter((n) => n.ratio < n.required);
  check(
    bad.length === 0,
    `${context}: contrast`,
    bad
      .map(
        (n) =>
          `"${n.text}" ${n.ratio}:1 (needs ${n.required}) ${n.colour} on ${n.background} [${n.className}]`,
      )
      .join(" | "),
  );

  // Part F3: tap targets >=44px. This app has no inline links inside prose, so
  // anything reported here is a real control that is too small.
  const small = report.tapTargets.filter((t) => t.height < 44 || t.width < 44);
  check(
    small.length === 0,
    `${context}: tap targets >=44px`,
    small.map((t) => `${t.tag} "${t.label}" ${t.width}x${t.height} [${t.className}]`).join(" | "),
  );

  if (opts.expectLang) {
    check(
      report.lang === opts.expectLang,
      `${context}: <html lang>`,
      `expected ${opts.expectLang}, got ${report.lang}`,
    );
  }

  // A horizontal scrollbar on a phone is the classic symptom of Part F3's ~30%
  // Spanish expansion pushing a fixed-width element past the viewport.
  check(
    report.scrollWidth <= report.clientWidth + 1,
    `${context}: no horizontal overflow`,
    `scrollWidth ${report.scrollWidth} > clientWidth ${report.clientWidth}`,
  );

  check(report.textNodes.length > 0, `${context}: rendered text`, "no text nodes found");
}

async function run() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  let modalMeasured = 0;

  for (const locale of LOCALES) {
    for (const viewport of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      // The locale mechanism under test is the NEXT_LOCALE cookie itself
      // (Slice 5), so the audit drives it exactly the way the pill does.
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: BASE }]);

      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));

      for (const route of PAGES) {
        const label = `${locale}/${viewport.name}${route}`;
        consoleErrors.length = 0;

        const response = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        check(response?.status() === 200, `${label}: HTTP 200`, `got ${response?.status()}`);

        await settleAnimations(page);
        const report = await page.evaluate(auditInPage);
        assess(report, label, { expectLang: locale });

        if (SHOTS) {
          await page.screenshot({
            path: path.join(SHOTS, `${locale}-${viewport.name}${slugForFile(route)}.png`),
            fullPage: true,
          });
        }

        // ── The bottom tab bar is a phone pattern, and only a phone pattern ──
        if (route === "/") {
          // `visible=true` before `.first()`, not after: BOTH navs are in the
          // DOM at every width (the header row is `hidden md:flex`, the tab bar
          // is `md:hidden`), so a plain `.first()` resolves to the display:none
          // one at 390px and reports a working nav as broken.
          const navVisible = await page
            .locator('nav[aria-label] >> css=[href="/browse"]')
            .locator("visible=true")
            .first()
            .isVisible()
            .catch(() => false);
          check(navVisible, `${label}: primary nav reachable`);

          const bottomNav = page.locator("nav.sticky.bottom-0");
          const bottomVisible = await bottomNav.isVisible().catch(() => false);
          check(
            viewport.name === "mobile" ? bottomVisible : !bottomVisible,
            `${label}: bottom tab bar ${viewport.name === "mobile" ? "present" : "absent"}`,
          );
        }

        // ── The <ComingSoon> sheet: only in the DOM while open, so its
        // contrast has to be measured with it open, in every locale/width ──
        if (route === "/style-guide") {
          // `[data-coming-soon]` is the marker the trigger stamps on itself.
          // `visible=true` matters: the header's desktop nav is in the DOM at
          // 390px but display:none, so a naive first-match resolves to
          // something unclickable.
          const trigger = page.locator("[data-coming-soon]").locator("visible=true").first();
          await trigger.click();
          await page.waitForSelector('[role="dialog"]', { state: "visible" });
          // The >=768px form scales in from 0.97 and `visible` resolves
          // mid-flight, which reports a 44px close button as 43.2px — a
          // measurement artifact that reads exactly like a real failure.
          await settleAnimations(page);

          const openReport = await page.evaluate(auditInPage);
          assess(openReport, `${label} [sheet open]`);

          const dialog = await page.evaluate(() => {
            const el = document.querySelector('[role="dialog"]');
            if (!el) return null;
            return {
              chars: el.innerText.trim().length,
              hasTitle: !!el.querySelector("h2, h3, [id]") && el.innerText.trim().length > 0,
              text: el.innerText.trim().slice(0, 400),
            };
          });
          check(dialog !== null, `${label}: sheet rendered`);
          check(dialog && dialog.chars > 80, `${label}: sheet has explanatory copy`, `${dialog?.chars} chars`);
          // Localized copy, not a fallback key — an untranslated modal in front
          // of a demo audience is the failure this whole pattern exists to
          // avoid, and a missing key renders as the key path itself.
          check(
            dialog && !/comingSoon\.features\./.test(dialog.text),
            `${label}: sheet copy is localized`,
            dialog?.text,
          );

          if (SHOTS) {
            await page.screenshot({
              path: path.join(SHOTS, `${locale}-${viewport.name}_sheet.png`),
            });
          }

          // Escape closes it, and focus returns to the trigger — the two a11y
          // behaviours Radix is carried for.
          await page.keyboard.press("Escape");
          await page.waitForSelector('[role="dialog"]', { state: "detached" });
          const focusReturned = await page.evaluate(() =>
            document.activeElement?.hasAttribute("data-coming-soon"),
          );
          check(true, `${label}: sheet closes on Escape`);
          check(focusReturned === true, `${label}: focus restored to trigger`);
          modalMeasured += 1;

          // ── The filter sheet's draft/apply behaviour ──
          const filterTrigger = page
            .locator("button", { hasText: locale === "es" ? "Filtros" : "Filters" })
            .locator("visible=true")
            .first();
          await filterTrigger.click();
          await page.waitForSelector('[role="dialog"]', { state: "visible" });
          await settleAnimations(page);
          const pill = page.locator('[role="dialog"] button[aria-pressed]').first();
          await pill.click();
          check(
            (await page.getByTestId("filter-summary").textContent())?.trim() === "—",
            `${label}: filter draft not applied before Apply`,
          );
          await page
            .locator('[role="dialog"] button', {
              hasText: locale === "es" ? "Ver resultados" : "Show results",
            })
            .first()
            .click();
          await page.waitForSelector('[role="dialog"]', { state: "detached" });
          const summary = (await page.getByTestId("filter-summary").textContent())?.trim();
          check(
            !!summary && summary !== "—" && summary.startsWith("category:"),
            `${label}: filter applies on Apply`,
            summary,
          );
        }

        // ── Slice 10: the listing detail page's own content and CTA ──
        if (route === "/meals/pastelon-de-platano") {
          const body = await page.evaluate(() => document.body.innerText);
          check(!body.includes("€"), `${label}: no euro sign`);
          check(body.includes("TTD"), `${label}: price renders in TTD`);

          const galleryImgs = await page.evaluate(() =>
            Array.from(document.querySelectorAll("img")).filter((i) =>
              (i.currentSrc || i.src).includes("/api/media/"),
            ),
          );
          check(galleryImgs.length >= 2, `${label}: gallery renders real photos`, `${galleryImgs.length} imgs`);

          const sellerLink = await page
            .locator(`a[href="/sellers/cocina-de-abuela"]`)
            .first()
            .isVisible()
            .catch(() => false);
          check(sellerLink, `${label}: seller row links to /sellers/[slug]`);

          // The sticky CTA — a real, page-specific trigger, not only the
          // style-guide's demo of the same registry key.
          const cta = page.locator('[data-coming-soon="requestOrder"]').locator("visible=true").first();
          check(await cta.isVisible().catch(() => false), `${label}: sticky "Request order" CTA visible`);
          await cta.click();
          await page.waitForSelector('[role="dialog"]', { state: "visible" });
          await settleAnimations(page);
          const dialogText = await page.evaluate(
            () => document.querySelector('[role="dialog"]')?.innerText.trim() ?? "",
          );
          check(
            dialogText.length > 40 && !/comingSoon\.features\./.test(dialogText),
            `${label}: CTA opens the real, localized requestOrder sheet`,
            dialogText.slice(0, 120),
          );
          await page.keyboard.press("Escape");
          await page.waitForSelector('[role="dialog"]', { state: "detached" });
        }

        // ── Slice 11: the seller profile's own content ──
        if (route === "/sellers/cocina-de-abuela") {
          const followBtn = page.getByRole("button", { name: /follow|seguir/i }).first();
          check(await followBtn.isVisible().catch(() => false), `${label}: Follow button visible`);

          const menuShelfLinks = await page.locator(`a[href="/stories/cocina-de-abuela"]`).count();
          check(menuShelfLinks > 0, `${label}: Menu shelf renders at least one card linking to the viewer`);

          const galleryImgs = await page.evaluate(() =>
            Array.from(document.querySelectorAll("img")).filter((i) =>
              (i.currentSrc || i.src).includes("/api/media/"),
            ),
          );
          check(galleryImgs.length >= 4, `${label}: cover/avatar/menu-shelf/listing photos all real`, `${galleryImgs.length} imgs`);

          const body = await page.evaluate(() => document.body.innerText);
          check(!body.includes("€"), `${label}: no euro sign`);
        }

        // ── Slice 11: the Fresh Today viewer's own mechanics ──
        if (route === "/stories/cocina-de-abuela") {
          const closeBtn = page.getByRole("button", { name: /close|cerrar/i }).first();
          check(await closeBtn.isVisible().catch(() => false), `${label}: close button visible`);

          const bars = await page.locator('div.fixed.inset-0 >> div.h-1.flex-1').count();
          check(bars > 0, `${label}: progress bar segments rendered (${bars})`);

          const storyImg = await page.evaluate(() => {
            const img = document.querySelector('div.fixed.inset-0 img');
            return img ? (img.currentSrc || img.src) : null;
          });
          check(!!storyImg && storyImg.includes("/api/media/"), `${label}: story photo served by the real storage route`);
        }

        check(
          consoleErrors.length === 0,
          `${label}: no console/page errors`,
          consoleErrors.slice(0, 3).join(" | "),
        );
      }

      await context.close();
    }
  }

  // ── One-off structural checks, locale-independent ──
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/style-guide`, { waitUntil: "networkidle" });

    // ── Mobile image performance on the discovery surfaces ──
    // Slice 9's done-when asks for "Lighthouse mobile perf sane on hero/card
    // images". Rather than quote a Lighthouse score (which folds in a dozen
    // things this slice does not control), this measures the thing the score
    // would actually be complaining about: how many bytes of imagery a phone
    // downloads for the home page, and whether the loader is serving the right
    // VARIANT for each slot rather than the full-size file everywhere.
    {
      const perfContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const perfPage = await perfContext.newPage();
      const images = [];
      // ⚠ **Measure the BODY, not the `content-length` header.** The media route
      // streams its response and sets no content-length, so the first version of
      // this block summed a column of zeros and cheerfully asserted "0KB is
      // under 2.5MB" — a check that could never fail, on the one page it exists
      // to protect. Caught by re-measuring independently rather than by any
      // assertion, which is the recurring lesson of this whole slice.
      const pending = [];
      perfPage.on("response", (response) => {
        const type = response.headers()["content-type"] ?? "";
        if (!type.startsWith("image/")) return;
        pending.push(
          response
            .body()
            .then((buf) => images.push({ url: response.url(), size: buf.length }))
            .catch(() => {}),
        );
      });
      await perfPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
      await Promise.all(pending);

      const total = images.reduce((sum, i) => sum + i.size, 0);
      check(total > 0, "perf: image payload was actually measured (not a vacuous zero)", `${total} bytes`);
      const largest = images.reduce((max, i) => Math.max(max, i.size), 0);
      check(
        total < 2_500_000,
        `perf: home page image payload under 2.5MB on a 390px viewport (${Math.round(total / 1024)}KB across ${images.length} images)`,
        `${Math.round(total / 1024)}KB`,
      );
      check(
        largest < 400_000,
        `perf: no single image over 400KB (largest ${Math.round(largest / 1024)}KB)`,
      );
      // ⚠ The real failure this guards against: shipping `-full` (1600px) files
      // into 150px rail slots. That is invisible on a laptop and ruinous on
      // Trinidad mobile data, which is exactly who this is for.
      const fullVariants = images.filter((i) => /-full\.webp/.test(i.url));
      check(
        fullVariants.length === 0,
        `perf: no 1600px -full variant is served to a phone (${fullVariants.length})`,
        fullVariants.map((i) => i.url.slice(-40)).join(" | "),
      );
      const lazy = await perfPage.evaluate(() =>
        Array.from(document.querySelectorAll("img")).filter((i) => i.loading === "lazy").length,
      );
      check(lazy > 0, `perf: below-the-fold images are lazy (${lazy})`);
      await perfContext.close();
    }

    // ── Anti-vacuity: prove the contrast detector still detects ──
    // The `sr-only` exclusion in `isVisible` is exactly the kind of filter that
    // can quietly turn a passing audit into a no-op. So inject two elements
    // with the SAME failing colours (ink on green-vivid at caption size,
    // 3.10:1) — one visible, one screen-reader-only — and assert the audit
    // reports the first and ignores the second.
    //
    // ⚠ **The colours are INLINE STYLES, not Tailwind classes, and that is the
    // whole point of this note.** The first version used
    // `className="bg-green-vivid text-ink text-caption"` and passed — until
    // Slice 8 deleted `components/scaffold/token-proof.tsx`, which turned out to
    // be the only file in the repo still *mentioning* `bg-green-vivid`. Tailwind
    // stopped emitting the class, the injected control rendered on plain cream
    // at 12.7:1, and the self-test reported "0 failures detected" — i.e. the
    // guard against a vacuous audit had itself gone vacuous, and it said so.
    // A control that depends on the build emitting a class is not a control.
    const control = await page.evaluate(
      ([auditSource]) => {
        const audit = new Function(`return (${auditSource})`)();
        const make = (cls) => {
          const el = document.createElement("span");
          el.className = cls;
          el.textContent = "CONTRAST CONTROL";
          // green-vivid #5E7B4F behind ink #2B2820 — 3.10:1, measured at Slice 1.
          el.style.backgroundColor = "rgb(94, 123, 79)";
          el.style.color = "rgb(43, 40, 32)";
          el.style.fontSize = "12px";
          el.style.fontWeight = "400";
          document.body.appendChild(el);
          return el;
        };
        const visible = make("inline-block");
        const hidden = make("sr-only");
        const report = audit();
        visible.remove();
        hidden.remove();
        const hits = report.textNodes.filter((n) => n.text.includes("CONTRAST CONTROL"));
        return {
          measured: hits.length,
          failing: hits.filter((n) => n.ratio < n.required).length,
          ratio: hits[0]?.ratio ?? null,
        };
      },
      [auditInPage.toString()],
    );
    check(
      control.ratio !== null && Math.abs(control.ratio - 3.1) < 0.15,
      `self-test: the control really is the 3.10:1 pairing it claims to be`,
      `measured ${control.ratio}:1`,
    );
    check(
      control.measured === 1,
      `self-test: sr-only text excluded, visible text measured`,
      `measured ${control.measured} of 2 controls`,
    );
    check(
      control.failing === 1,
      `self-test: a sub-threshold pairing is still reported as a failure`,
      `${control.failing} failures detected`,
    );

    // The gallery's photos are pipeline output served by the real loader —
    // `-thumb`/`-card`/`-full` keys under /api/media, never data: URIs.
    const imgs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img")).map((i) => ({
        src: i.currentSrc || i.src,
        srcset: i.getAttribute("srcset") || "",
      })),
    );
    check(imgs.length >= 8, `media: gallery renders photos`, `${imgs.length} img elements`);
    check(
      imgs.every((i) => i.src.includes("/api/media/")),
      `media: every photo served by the real storage route`,
      imgs
        .filter((i) => !i.src.includes("/api/media/"))
        .map((i) => i.src.slice(0, 60))
        .join(" | "),
    );
    check(
      imgs.some((i) => /-thumb\.webp/.test(i.srcset)) && imgs.some((i) => /-card\.webp/.test(i.srcset)),
      `media: loader emits real variant srcsets`,
    );

    // Blur-up, not a spinner: next/image inlines the LQIP as a background on
    // the <img> itself until the real file decodes.
    const html = await page.content();
    check(
      html.includes("data:image/jpeg;base64,"),
      `media: blur placeholders inlined (blur-up, never a spinner)`,
    );

    // The €-mockup trap (Part F3 "do not reproduce"): every price on the page
    // must be $X,XXX TTD and nothing else.
    const body = await page.evaluate(() => document.body.innerText);
    check(!body.includes("€"), `money: no euro sign anywhere`);
    check(body.includes("TTD"), `money: prices render in TTD`);
    check(body.includes("$120 TTD"), `money: STARTING_AT renders its price`, body.slice(0, 200));

    // A QUOTE listing must never render a zero price.
    check(!body.includes("$0 TTD"), `money: QUOTE listing renders no price`);

    // robots: noindex — this is a build tool, not a storefront page.
    const robots = await page.evaluate(
      () => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
    );
    check(/noindex/.test(robots), `style-guide: robots noindex`, robots);

    // Every registry key rendered a trigger — the stub inventory, checked
    // against the rendered page rather than against the registry alone.
    const stubs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-coming-soon]")).map((el) =>
        el.getAttribute("data-coming-soon"),
      ),
    );
    // ⚠ Keep in step with `lib/coming-soon.ts`. Slice 13 retired `becomeSeller`
    // (the footer links to real onboarding now); Slice 14 retired
    // `sellerListings` the same way (the nav links to `/food/listings` now).
    // Both are checked for ABSENCE below, not merely dropped from the
    // present-list — a retirement that silently regressed (the stub coming
    // back because a later edit re-added the registry key) would otherwise
    // pass this audit by doing nothing.
    for (const key of [
      "requestOrder",
      "buyerOrders",
      "messageSeller",
      "buyerAccount",
      "sellerStories",
      "sellerOrders",
      "sellerInsights",
    ]) {
      check(stubs.includes(key), `stubs: "${key}" rendered a trigger`);
    }
    check(!stubs.includes("becomeSeller"), `stubs: "becomeSeller" retired (Slice 13)`);
    check(!stubs.includes("sellerListings"), `stubs: "sellerListings" retired (Slice 14)`);

    await context.close();
  }

  await browser.close();

  console.log(`\nComingSoon sheet audited in ${modalMeasured} locale/width combinations`);
  console.log(`\n${passes} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
