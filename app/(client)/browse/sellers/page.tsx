import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { RegionKey } from "@prisma/client";

import { SellerCard } from "@/components/seller-card";
import { SectionHeader } from "@/components/ui/section-header";
import { SELLER_CARD_SELECT, sellerCountsByArea } from "@/lib/discovery";
import { publicSellerWhere } from "@/lib/visibility";
import { prisma } from "@/lib/prisma";
import { isRegionKey } from "@/lib/regions";
import { AreaPicker } from "./area-picker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.sellers");
  return { title: t("title") };
}

/**
 * `/browse/sellers` — the seller directory (Part E1's "sellers directory
 * (region-map picker + cards)", Part F1's sitemap).
 *
 * ⚠ Only ACTIVE sellers appear. The seed carries a SUSPENDED and a PENDING
 * seller precisely so a query that forgets this is caught here rather than in
 * production.
 */
export default async function SellersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw =
    typeof params.area === "string" ? params.area : Array.isArray(params.area) ? params.area[0] : "";
  const areas = (raw ?? "").split(",").filter(isRegionKey) as RegionKey[];

  const [t, ts, counts, sellers] = await Promise.all([
    getTranslations("client.sellers"),
    getTranslations("client.sections"),
    sellerCountsByArea(),
    prisma.foodSeller.findMany({
      where: {
        ...(await publicSellerWhere()),
        ...(areas.length > 0 ? { areas: { hasSome: areas } } : {}),
      },
      select: SELLER_CARD_SELECT,
      orderBy: [{ followerCount: "desc" }],
    }),
  ]);

  return (
    <>
      <SectionHeader as="h1" title={t("title")} note={t("results", { count: sellers.length })} />

      <AreaPicker counts={counts} />

      {sellers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sellers.map((seller) => (
            <SellerCard
              key={seller.slug}
              href={`/sellers/${seller.slug}`}
              name={seller.displayName}
              areas={seller.areas.map((a) => ts.raw(`areaNames.${a}`) as string)}
              specialties={seller.specialties.slice(0, 2)}
              cover={
                seller.coverImageCard
                  ? { src: seller.coverImageCard, blurDataUrl: seller.coverImageBlur }
                  : null
              }
              avatar={
                seller.profileImageThumb
                  ? { src: seller.profileImageThumb, blurDataUrl: seller.profileImageBlur }
                  : null
              }
              followerLabel={ts("followers", { count: seller.followerCount })}
              hasFreshToday={seller.lastStoryAt !== null}
              freshTodayLabel={ts("freshDot")}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-card border border-hairline bg-card p-8">
          <h2 className="font-display text-h1 font-semibold text-ink">{t("emptyTitle")}</h2>
          <p className="max-w-lg text-body text-ink-muted">{t("emptyBody")}</p>
        </div>
      )}
    </>
  );
}
