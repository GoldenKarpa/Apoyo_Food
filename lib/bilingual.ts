import { translateText } from "@/lib/translate";
import type { Locale } from "@/i18n/request";

/**
 * The stored-translation shape Food uses (architecture Part D / E6), matching
 * Salon's locked message shape: `originalText`, `originalLocale`, and
 * `translations Json` (locale → text), **computed once at send time and never
 * recomputed on read**.
 *
 * ⚠ Food's only stored-translation site is `FoodOrderMessage` — deliberately.
 * Unlike Apparel, Food's schema carries NO per-field bilingual columns on
 * listings or seller bios (Slice 2 followed Part D verbatim, and Part D doesn't
 * ask for them): a seller authors a dish description once, in their own
 * language, and Part E3 handles cross-language *discovery* with unaccent +
 * trigram matching rather than by storing two copies of every listing. So these
 * helpers are shaped for the message triple, not for a generic `<field>` /
 * `<field>OriginalLocale` / `<field>Translations` convention.
 *
 * Why eager (write-time) rather than lazy (read-time, as Salon's chat does):
 * Salon translates per (message, reader-locale) pair because a reader's locale
 * isn't known until they open the thread. Food is en/es only, so there is
 * exactly ONE other locale a message could ever need — one call at send time
 * covers every future reader, and Part E6 asks for exactly that.
 */

const OTHER_LOCALE: Record<Locale, Locale> = { en: "es", es: "en" };

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
 * Send-time translation. Computes the other locale's translation once and
 * returns exactly what `FoodOrderMessage` persists.
 *
 * **Never throws.** Slice 5's own done-when requires that a down service
 * degrades to delivering the original rather than erroring — and for Food that
 * is stronger than a nicety: an order message failing to send because a
 * translation microservice is down would break the order lifecycle itself. A
 * caller always has something safe to persist, even mid-outage. When the
 * service later comes back, new messages translate normally; the older ones
 * keep showing their original, which is exactly the documented degrade.
 */
export async function prepareTranslatedText(
  rawText: string,
  authorLocale: Locale,
): Promise<TranslatedText> {
  const originalText = rawText.trim();
  if (!originalText) {
    return { originalText: "", originalLocale: authorLocale, translations: {} };
  }

  const target = OTHER_LOCALE[authorLocale];
  try {
    const result = await translateText(originalText, target, authorLocale);
    // `skipped: true` means the service detected source == target and echoed the
    // input back. Storing that as a "translation" would render the same string
    // twice in the thread, so treat it as no translation at all.
    if (result.skipped) {
      return { originalText, originalLocale: authorLocale, translations: {} };
    }
    return {
      originalText,
      originalLocale: authorLocale,
      translations: { [target]: result.translated },
    };
  } catch (err) {
    console.error("[bilingual] send-time translation failed — storing original only", err);
    return { originalText, originalLocale: authorLocale, translations: {} };
  }
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
