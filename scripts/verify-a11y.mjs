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
 * `/food` is included even though Phase 2 is where the seller surface gets its
 * design budget: an accessibility floor is not an aesthetic, and that surface
 * shares these tokens and this locale pill.
 */
const PAGES = ["/", "/browse", "/style-guide", "/food"];

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
            path: path.join(SHOTS, `${locale}-${viewport.name}${route.replace(/\//g, "_")}.png`),
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

    // ── Anti-vacuity: prove the contrast detector still detects ──
    // The `sr-only` exclusion added to `isVisible` is exactly the kind of
    // filter that can quietly turn a passing audit into a no-op. So inject two
    // elements with the SAME failing colours (ink on green-vivid at caption
    // size, 3.10:1) — one visible, one screen-reader-only — and assert the
    // audit reports the first and ignores the second. A run where the detector
    // has been neutered fails here instead of reporting 0 failures.
    const control = await page.evaluate(
      ([auditSource]) => {
        const audit = new Function(`return (${auditSource})`)();
        const make = (cls) => {
          const el = document.createElement("span");
          el.className = `${cls} bg-green-vivid text-ink text-caption`;
          el.textContent = "CONTRAST CONTROL";
          document.body.appendChild(el);
          return el;
        };
        const visible = make("inline-block px-3 py-1");
        const hidden = make("sr-only");
        const report = audit();
        visible.remove();
        hidden.remove();
        const hits = report.textNodes.filter((n) => n.text.includes("CONTRAST CONTROL"));
        return { measured: hits.length, failing: hits.filter((n) => n.ratio < n.required).length };
      },
      [auditInPage.toString()],
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
    for (const key of ["becomeSeller", "requestOrder", "buyerOrders", "messageSeller", "buyerAccount"]) {
      check(stubs.includes(key), `stubs: "${key}" rendered a trigger`);
    }

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
