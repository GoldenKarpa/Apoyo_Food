import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.offline");
  return { title: t("title") };
}

/**
 * `/offline` — the service worker's navigation fallback (Slice 12, `public/sw.js`).
 *
 * ⚠ Reads nothing session- or database-dependent, deliberately. `public/sw.js`
 * precaches whatever HTML this route returns at INSTALL time and replays that
 * one snapshot to every offline visitor thereafter, so the page must render
 * identically regardless of who's looking at it — translations only, same as
 * `<SiteHeader>` above it in the layout tree.
 */
export default async function OfflinePage() {
  const t = await getTranslations("client.offline");

  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-hairline bg-card p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-sunken text-ink-muted">
        <WifiOff aria-hidden className="h-6 w-6" />
      </span>
      <h1 className="font-display text-h1 font-semibold text-ink">{t("title")}</h1>
      <p className="max-w-md text-body text-ink-muted">{t("body")}</p>
    </div>
  );
}
