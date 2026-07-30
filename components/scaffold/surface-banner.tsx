import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * ⚠ SCAFFOLDING WITH A SCHEDULED DEATH — Slice 7 deletes this file along with
 * `token-proof.tsx`, when the real Sobremesa component library and page chrome
 * land.
 *
 * It exists so Slice 1's host-gating and surface→locale mechanism are *visible*
 * on the page rather than only inferable from a curl transcript: it shows the
 * resolved surface, the locale that surface produced, and the Host header that
 * middleware gated on.
 */
export async function SurfaceBanner() {
  const [headerStore, locale, t] = await Promise.all([
    headers(),
    getLocale(),
    getTranslations("scaffold"),
  ]);

  const rows: [string, string][] = [
    [t("surface"), headerStore.get("x-food-surface") ?? "—"],
    [t("locale"), locale],
    [t("host"), headerStore.get("host") ?? "—"],
  ];

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-card border border-hairline bg-sunken px-4 py-3 text-label">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          {/* Full `ink`, not `ink-muted`: this sits on `sunken`, where
              ink-muted measures 4.37:1 — below the 4.5 bar. */}
          <dt className="text-ink">{label}</dt>
          <dd className="font-medium text-green">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
