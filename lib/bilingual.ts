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

/**
 * ⚠ The READ half lives in `lib/bilingual-read.ts` — a module importing nothing
 * but a type — and is re-exported here so every existing importer keeps working
 * and there is exactly one definition. It was split out at PD-S10's review
 * because THIS file imports the translation HTTP client at module scope, and
 * `<OrderThread>` (isomorphic since PD-S10) would otherwise drag that whole
 * graph into the browser bundle. See that file's header.
 */
export { resolveTranslatedText } from "@/lib/bilingual-read";
export type { TranslatedText, ResolvedText } from "@/lib/bilingual-read";

import type { TranslatedText } from "@/lib/bilingual-read";

const OTHER_LOCALE: Record<Locale, Locale> = { en: "es", es: "en" };

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

