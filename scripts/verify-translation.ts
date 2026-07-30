/**
 * Slice 5 verification — proves BOTH translate paths against something real.
 *
 * ⚠ `kap64-translate` is confirmed unreachable from local dev (VPS-only by its
 * own design; re-checked directly at this slice — nothing listens on :5500 or
 * :5600 on this machine). That makes the **down-service path the default state
 * here, not a scenario that has to be staged** — so it is exercised against the
 * genuine absence of the service, not a mock.
 *
 * The **success** path still has to be proven rather than reasoned about, so a
 * small in-process HTTP server implementing kap64-translate's actual documented
 * contract (`POST /translate` → `{translated, provider, fromCache, detectedLang,
 * skipped}`, from its CLAUDE.md) stands in for GCT/LibreTranslate.
 * `lib/translate.ts`'s own `fetch` is NEVER mocked — it really performs an HTTP
 * round-trip, just against a stand-in origin. Same spirit as
 * `scripts/mint-test-session.ts`: a committed test double for a dependency this
 * environment genuinely cannot run.
 *
 * ⚠ **A bug this script found in itself, worth keeping in mind when reading it.**
 * The first version pointed at a different stub per scenario and cache-busted
 * `lib/bilingual.ts` between them — but `bilingual`'s own static import of
 * `lib/translate.ts` was NOT busted, and `translate` captured the service URL in
 * a module-level const at first import. So three scenarios silently kept talking
 * to the FIRST stub's (by then closed) port and still reported PASS: the 503
 * case never saw a 503, and the "service genuinely absent" case never reached
 * localhost:5500. One unrelated failing assertion is all that exposed it.
 * `lib/translate.ts` now reads the env var per call, and **every scenario below
 * asserts its stub actually received the request** — so a scenario that quietly
 * stops exercising what it claims will fail rather than pass.
 *
 * Run: npm run verify:translation
 */
import http from "http";
import type { AddressInfo } from "net";

import { prepareTranslatedText, resolveTranslatedText } from "../lib/bilingual";

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

interface StubRequest {
  text: string;
  targetLang: string;
  sourceLang?: string;
}

/** A stand-in implementing kap64-translate's documented contract. */
function startStub(behaviour: "ok" | "skip" | "503") {
  const requests: StubRequest[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url?.startsWith("/translate")) {
        res.writeHead(404).end();
        return;
      }
      const parsed = JSON.parse(body || "{}") as StubRequest;
      requests.push(parsed);

      if (behaviour === "503") {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Translation service unreachable" }));
        return;
      }
      if (behaviour === "skip") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            translated: parsed.text,
            provider: "none",
            fromCache: false,
            detectedLang: parsed.targetLang,
            skipped: true,
          }),
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          translated: `[${parsed.targetLang}] ${parsed.text}`,
          provider: "google",
          fromCache: false,
          detectedLang: parsed.sourceLang ?? "es",
          skipped: false,
        }),
      );
    });
  });
  return new Promise<{ url: string; requests: StubRequest[]; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

async function main() {
  // ==========================================================================
  section("Ambient reality — the real service is genuinely unreachable here");
  // ==========================================================================
  let reachable = true;
  try {
    await fetch("http://localhost:5500/health", { signal: AbortSignal.timeout(2500) });
  } catch {
    reachable = false;
  }
  assert("kap64-translate is NOT reachable from local dev (VPS-only by design)", !reachable);

  // ==========================================================================
  section("Success path — against a real HTTP stub, real fetch, real round-trip");
  // ==========================================================================
  {
    const stub = await startStub("ok");
    process.env.TRANSLATE_SERVICE_URL = stub.url;

    const stored = await prepareTranslatedText("¿Puede ser sin picante?", "es");
    assert("the stub really received one HTTP request", stub.requests.length === 1, stub.requests);
    assert("…asking for the OTHER locale", stub.requests[0]?.targetLang === "en", stub.requests[0]);
    assert("…and declaring the author's locale as the source", stub.requests[0]?.sourceLang === "es");
    assert("original stored verbatim", stored.originalText === "¿Puede ser sin picante?");
    assert("originalLocale stored", stored.originalLocale === "es");
    assert("translation stored under the target locale", stored.translations.en === "[en] ¿Puede ser sin picante?", stored.translations);

    // The load-bearing claim: computed ONCE, never recomputed on read.
    const asEn = resolveTranslatedText(stored, "en");
    const asEs = resolveTranslatedText(stored, "es");
    resolveTranslatedText(stored, "en");
    assert("…and reads make NO further network calls (still exactly 1)", stub.requests.length === 1, {
      requests: stub.requests.length,
    });

    assert("EN viewer sees the translation", asEn?.text === "[en] ¿Puede ser sin picante?" && asEn?.isTranslated === true, asEn);
    assert("…with the original still attached for the toggle", asEn?.original === "¿Puede ser sin picante?");
    assert("ES viewer (author's own locale) sees the original, untranslated", asEs?.text === "¿Puede ser sin picante?" && asEs?.isTranslated === false, asEs);

    await stub.close();
  }

  // ==========================================================================
  section("Degrade path — the genuine down-service case");
  // ==========================================================================
  {
    // Point at the real (absent) service: no stub, nothing listening. Asserted
    // to be genuinely unreachable at the top of this script, so this scenario
    // cannot quietly become "some other closed port".
    process.env.TRANSLATE_SERVICE_URL = "http://localhost:5500";
    assert("this scenario really targets the absent service", process.env.TRANSLATE_SERVICE_URL === "http://localhost:5500");

    let threw = false;
    let stored;
    try {
      stored = await prepareTranslatedText("Hola, ¿está disponible el sábado?", "es");
    } catch {
      threw = true;
    }
    assert("prepareTranslatedText NEVER throws when the service is down", !threw);
    assert("…the original is still delivered intact", stored?.originalText === "Hola, ¿está disponible el sábado?", stored);
    assert("…with an empty translations map (nothing fabricated)", Object.keys(stored?.translations ?? {}).length === 0, stored?.translations);

    // The critical product consequence: a reader still sees real words.
    const asEn = resolveTranslatedText(stored!, "en");
    assert("an EN reader still sees the Spanish original, not an error or a blank", asEn?.text === "Hola, ¿está disponible el sábado?", asEn);
    assert("…flagged as NOT translated, so no misleading 'translated' label renders", asEn?.isTranslated === false);
  }

  // ==========================================================================
  section("Degrade path — service reachable but returning its documented 503");
  // ==========================================================================
  {
    const stub = await startStub("503");
    process.env.TRANSLATE_SERVICE_URL = stub.url;

    const stored = await prepareTranslatedText("Dos bandejas para el domingo", "es");
    // ⚠ Anti-vacuity: without this, a misconfigured URL would degrade for the
    // WRONG reason and the assertion below would still pass.
    assert("the 503 stub really received the request", stub.requests.length === 1, stub.requests);
    assert("a 503 from the service degrades identically to it being absent", Object.keys(stored.translations).length === 0);
    assert("…and the original still survives", stored.originalText === "Dos bandejas para el domingo");
    await stub.close();
  }

  // ==========================================================================
  section("`skipped: true` (source == target) is not stored as a translation");
  // ==========================================================================
  {
    const stub = await startStub("skip");
    process.env.TRANSLATE_SERVICE_URL = stub.url;

    const stored = await prepareTranslatedText("Ready at 10", "en");
    assert("the skip stub really received the request", stub.requests.length === 1, stub.requests);
    assert("an echoed input is NOT persisted as a translation", Object.keys(stored.translations).length === 0, stored.translations);
    const asEs = resolveTranslatedText(stored, "es");
    assert("…so the thread never renders the same string twice", asEs?.isTranslated === false && asEs?.text === "Ready at 10", asEs);
    await stub.close();
  }

  // ==========================================================================
  section("Edge cases");
  // ==========================================================================
  {
    const stub = await startStub("ok");
    process.env.TRANSLATE_SERVICE_URL = stub.url;

    const empty = await prepareTranslatedText("   ", "es");
    assert("blank text makes no network call at all", stub.requests.length === 0, stub.requests);
    assert("…and resolves to null rather than an empty bubble", resolveTranslatedText(empty, "en") === null);

    const trimmed = await prepareTranslatedText("  con arepas  ", "es");
    assert("text is trimmed before storage and translation", trimmed.originalText === "con arepas", trimmed);
    assert("…and that trimmed text is what was sent", stub.requests[0]?.text === "con arepas", stub.requests[0]);

    const legacy = resolveTranslatedText(
      { originalText: "algo", originalLocale: null, translations: null },
      "en",
    );
    assert("a row with null locale/translations resolves safely", legacy?.text === "algo" && legacy?.isTranslated === false, legacy);

    await stub.close();
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
