/**
 * Client for the shared **kap64-translate** microservice (architecture B1 /
 * ecosystem locked decision 10). A separate repo and deployment
 * (`Desktop/#Coding/##Claude/kap64-translate` on this machine), not part of this
 * codebase — do NOT build a new translation mechanism here.
 *
 * ⚠ **This is mission-critical for Food, not a nicety** (arch B1): many sellers
 * are Spanish-first and many customers English-first, so the order thread only
 * works at all if the language barrier is crossed. Part E6 is explicit that
 * translations are computed **once at send time** and stored on the message —
 * never recomputed on read.
 *
 * ⚠ **Confirmed unreachable from local dev, 2026-07-30** (re-checked directly at
 * this slice, not inherited): nothing listens on :5500 or :5600 on this machine.
 * kap64-translate is VPS-only by its own design — its CLAUDE.md says it "runs at
 * localhost:5500 … never proxied through Nginx" — and this machine has neither a
 * GCP service-account key nor a LibreTranslate install to bring it up. Salon's
 * and Demia's own `.env.local` point at the same URL, so this is the ambient dev
 * reality, not something wrong with Food. **Consequence: the service-down path
 * is the DEFAULT state here, not a scenario that has to be staged** — which is
 * why `lib/bilingual.ts` treats degradation as an ordinary outcome.
 *
 * Only `POST /translate` is ported. kap64-translate also exposes
 * `/translate/literal` (a Qwen-backed word-for-word rendering) and `/status`,
 * but Food's plan has no literal-translation UI anywhere — Part E6 wants one
 * natural translation shown gently beneath the original. Porting an endpoint
 * with no caller would be cargo-culted surface, so it is deliberately absent;
 * add it if a feature ever needs it.
 */

/**
 * ⚠ Read at CALL time, not captured in a module-level const — a deliberate
 * divergence from Salon's and Apparel's ported copies, made for a concrete
 * reason rather than taste.
 *
 * A module-level `const SERVICE_URL = process.env...` is evaluated once, on
 * first import, which makes the module's configuration depend on import ORDER.
 * That is a real footgun and it drew blood immediately: Slice 5's verification
 * script points at a different stub server per scenario, and with a frozen URL
 * three of its cases silently kept talking to the FIRST scenario's (by then
 * closed) port. They still reported PASS — the 503 case never saw a 503, and the
 * "service genuinely absent" case never reached localhost:5500. One unrelated
 * assertion failing is what exposed it.
 *
 * Reading the env var per call costs nothing measurable (server-side
 * `process.env` is a runtime lookup either way) and makes the module honestly
 * reconfigurable. Apparel keeps the const form and works around it with dynamic
 * imports; this is the version without the footgun.
 */
function serviceUrl(): string {
  return process.env.TRANSLATE_SERVICE_URL ?? "http://localhost:5500";
}

/** kap64-translate's documented `POST /translate` 200 response. */
export interface TranslateResult {
  translated: string;
  provider: "google" | "libretranslate" | "none" | string;
  fromCache: boolean;
  detectedLang: string | null;
  /** True when source language == target: `translated` equals the input, no API call made. */
  skipped?: boolean;
}

/**
 * Throws on any non-2xx (including the service's documented 503 "both providers
 * unavailable") and on a transport failure. Callers that must not fail — i.e.
 * every write path — go through `lib/bilingual.ts`, which catches and degrades.
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<TranslateResult> {
  const res = await fetch(`${serviceUrl()}/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Blank key = no header, matching kap64-translate's "internal-only mode".
      ...(process.env.TRANSLATE_API_KEY
        ? { Authorization: `Bearer ${process.env.TRANSLATE_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ text, targetLang, sourceLang }),
    // A translation must never hold an order-message send open indefinitely.
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Translate service error ${res.status}`);
  }

  return res.json() as Promise<TranslateResult>;
}
