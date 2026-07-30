import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const VALID_LOCALES = ["en", "es"] as const;
export type Locale = (typeof VALID_LOCALES)[number];

export function isValidLocale(value: string | undefined): value is Locale {
  return !!value && (VALID_LOCALES as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  // Cookie always wins (set once a viewer picks a locale via the ES/EN toggle,
  // or from their JWT locale once auth lands in Slice 3). Otherwise default by
  // surface per BUILD_SLICES.md conventions: client marketplace en, seller
  // dashboard es — most sellers here are Spanish-first.
  const locale: Locale = isValidLocale(cookieLocale)
    ? cookieLocale
    : headerStore.get("x-food-surface") === "seller"
      ? "es"
      : "en";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
