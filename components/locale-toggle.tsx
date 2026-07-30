"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { Locale } from "@/i18n/request";
import { cn } from "@/lib/utils";

const LOCALES: Locale[] = ["en", "es"];

/**
 * The ES/EN toggle pill (architecture Part F3).
 *
 * ⚠ Part F3 is emphatic that this is **"bilingual as brand, not a hidden
 * setting"** — top-right, always visible, on every surface. It is not a
 * preferences-screen item, so it lives in the header chrome from this slice
 * onward rather than waiting for a settings page that would bury it.
 *
 * Mechanism: set the `NEXT_LOCALE` cookie client-side, then `router.refresh()`
 * so `i18n/request.ts` re-resolves on the server without a full page reload
 * (which would also throw away any client-held state). Slice 1 already built the
 * cookie-over-surface-default resolution chain this drives.
 *
 * Sized so **each segment** clears the ≥44px tap target independently, rather
 * than the pill clearing it collectively — Apparel measured its own version and
 * found padding alone left one segment at 43.6px while the other passed.
 */
export function LocaleToggle() {
  const locale = useLocale();
  const t = useTranslations("localeToggle");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function selectLocale(next: Locale) {
    if (next === locale || isPending) return;
    // One year, matching next-intl's own cookie default — a deliberate
    // preference, not a session-scoped default.
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label={t("ariaLabel")}
      className="inline-flex h-11 shrink-0 items-center rounded-pill bg-sunken"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          disabled={isPending}
          onClick={() => selectLocale(l)}
          className={cn(
            "h-11 min-w-[44px] rounded-pill px-3.5 text-caption font-medium uppercase tracking-wide transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-50",
            // Selected segment is the anchor green with a card-cream label
            // (5.44:1). Unselected uses full `ink` on hover rather than
            // `ink-muted`, because this pill sits on the `sunken` surface where
            // ink-muted measures 4.37:1 — below the bar.
            locale === l ? "bg-green text-card" : "text-ink hover:bg-green-soft",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
