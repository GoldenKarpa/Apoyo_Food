import type { Locale } from "@/i18n/request";

/**
 * The READ half of Food's stored-translation shape (architecture Part D / E6).
 *
 * ## ⚠ Why this is a separate module from `lib/bilingual.ts`
 *
 * Split at PD-S10's review. `lib/bilingual.ts` imports `lib/translate.ts` — the
 * kap64-translate HTTP client — at module scope, for the WRITE half's sake.
 * `<OrderThread>` only ever needed the read half, and while the two lived
 * together that was harmless: the component was server-only.
 *
 * PD-S10 made `<OrderThread>` isomorphic so the demo could render it from
 * client state, which put the whole import graph into the BROWSER bundle —
 * shipping the translation client, and its server-only env references, to every
 * visitor as dead code. No secret leaks (a non-`NEXT_PUBLIC_` env var is simply
 * undefined client-side), but it is exactly the hazard `lib/order-message-form.ts`
 * documents in its own header: "anything this file pulls in transitively gets
 * bundled into the BROWSER build".
 *
 * So the pure, network-free half lives here and imports nothing but a type.
 * `lib/bilingual.ts` re-exports all of it, so every existing importer is
 * unchanged and there is one definition. ⚠ **Never import `lib/translate.ts`
 * into this file** — that would undo the entire point of the split.
 */

/** The three columns `FoodOrderMessage` stores for a piece of authored text. */
export interface TranslatedText {
  originalText: string;
  originalLocale: Locale;
  translations: Record<string, string>;
}

export interface ResolvedText {
  /** What to render prominently for this viewer. */
  text: string;
  /** Always the author's original, for the gentler secondary line / toggle. */
  original: string;
  originalLocale: Locale;
  /** True only when `text` is a real translation distinct from `original`. */
  isTranslated: boolean;
}

/**
 * Read-time resolution. **Makes zero network calls, ever** — that reads are pure
 * is the entire point of storing the translation once.
 *
 * Falls back to the original whenever no translation applies, whether because
 * the author already wrote in the viewer's locale or because the send-time
 * translation never landed (service down). Both degrade identically and
 * silently, which is the intended behaviour: the reader sees real words, never
 * an error or an empty bubble.
 */
export function resolveTranslatedText(
  message: { originalText: string | null; originalLocale: string | null; translations: unknown },
  viewerLocale: Locale,
): ResolvedText | null {
  if (!message.originalText) return null;

  const originalLocale = (message.originalLocale as Locale | null) ?? viewerLocale;
  const original = message.originalText;

  if (originalLocale === viewerLocale) {
    return { text: original, original, originalLocale, isTranslated: false };
  }

  const translations = (message.translations ?? {}) as Record<string, string>;
  const translated = translations[viewerLocale];
  if (!translated) {
    return { text: original, original, originalLocale, isTranslated: false };
  }

  return { text: translated, original, originalLocale, isTranslated: true };
}
