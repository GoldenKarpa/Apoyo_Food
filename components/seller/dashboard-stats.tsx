import { getTranslations } from "next-intl/server";
import { Eye, Heart, Users } from "lucide-react";

/**
 * The "basic seller dashboard" Slice 15's own brief narrows Part E7 to:
 * "views/saves/follows counts — not the full analytics/insights dashboard
 * (that's Phase 6, later)." Three numbers, no charts, no funnel, no time
 * series — `lib/seller-stories.ts`'s `sellerDashboardStats` is the entire
 * query surface this component reads.
 */
export async function DashboardStats({
  stats,
}: {
  stats: { views: number; saves: number; follows: number };
}) {
  const t = await getTranslations("seller.dashboard.stats");

  const tiles = [
    { key: "views", value: stats.views, icon: Eye },
    { key: "saves", value: stats.saves, icon: Heart },
    { key: "follows", value: stats.follows, icon: Users },
  ] as const;

  return (
    <section className="grid gap-4 sm:grid-cols-3">
      {tiles.map(({ key, value, icon: Icon }) => (
        <div key={key} className="flex items-center gap-3 rounded-card border border-hairline bg-card p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-green-soft text-ink">
            <Icon aria-hidden className="size-5" />
          </span>
          <div>
            <p className="font-display text-h2 font-semibold text-ink">{value.toLocaleString("en-TT")}</p>
            <p className="text-caption text-ink">{t(key)}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
