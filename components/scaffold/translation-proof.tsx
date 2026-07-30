import fs from "fs/promises";
import path from "path";
import { getLocale, getTranslations } from "next-intl/server";

import { TranslationProofClient } from "@/components/scaffold/translation-proof-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveTranslatedText, prepareTranslatedText, type TranslatedText } from "@/lib/bilingual";
import { getUploadsBase } from "@/lib/storage";
import { isValidLocale, type Locale } from "@/i18n/request";

/**
 * ⚠ SCAFFOLDING WITH A SCHEDULED DEATH — Slice 7 deletes this alongside the
 * other `scaffold/*` components; the real bilingual surface is Slice 18's order
 * thread, rendered from actual `FoodOrderMessage` rows.
 *
 * It exists so "computed once, never recomputed" is *independently checkable* by
 * whoever opens the page next, rather than being a claim in a comment: the
 * translation is computed on first load through the REAL pipeline (one network
 * call, to whichever service is actually configured), persisted, and every
 * subsequent load — any locale, any number of reloads — only ever reads the
 * stored result.
 *
 * It is cached in a file rather than the database on purpose: a
 * `FoodOrderMessage` needs an order, which needs a seller and a listing, and
 * fabricating that whole chain just to demonstrate a text triple would put fake
 * commercial rows in the dev database.
 */

const CACHE_FILE = "_translation-proof.json";

// Authored in Spanish, so an EN viewer sees a real translation and an ES viewer
// sees the original with no toggle — both halves of the behaviour on one page.
const SAMPLE_TEXT = "¿Puede ser sin picante? Y si es posible, lo recojo el sábado a las 10.";
const SAMPLE_LOCALE: Locale = "es";

async function cachePath(): Promise<string> {
  return path.join(getUploadsBase(), CACHE_FILE);
}

async function loadOrBuild(): Promise<TranslatedText> {
  const file = await cachePath();
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as TranslatedText;
  } catch {
    // The one and only network call. `prepareTranslatedText` never throws, so a
    // down service simply yields an empty `translations` map — which is exactly
    // what the degrade path is supposed to persist.
    const prepared = await prepareTranslatedText(SAMPLE_TEXT, SAMPLE_LOCALE);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(prepared, null, 2));
    return prepared;
  }
}

export async function TranslationProof() {
  const [stored, locale, t] = await Promise.all([
    loadOrBuild(),
    getLocale(),
    getTranslations("translation"),
  ]);

  const viewerLocale: Locale = isValidLocale(locale) ? locale : "en";
  const resolved = resolveTranslatedText(stored, viewerLocale);
  if (!resolved) return null;

  const serviceWasDown = Object.keys(stored.translations).length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-label text-ink-muted">{t("note")}</p>

        <TranslationProofClient
          text={resolved.text}
          original={resolved.original}
          isTranslated={resolved.isTranslated}
          labels={{
            autoTranslated: t("autoTranslated"),
            seeOriginal: t("seeOriginal"),
            seeTranslation: t("seeTranslation"),
          }}
        />

        <p className="text-caption text-ink-muted">
          {t("authoredIn")} <span className="font-medium text-ink">{stored.originalLocale}</span>
          {" · "}
          {`viewer: ${viewerLocale}`}
        </p>

        {serviceWasDown && (
          <p className="rounded-control bg-gold-soft px-3 py-2 text-caption text-ink">
            {t("serviceDown")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
