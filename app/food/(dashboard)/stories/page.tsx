import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { StoryPostForm } from "@/components/seller/story-post-form";
import { ActiveStoriesList, type ActiveStoryRow } from "@/components/seller/active-stories-list";
import { HighlightManager } from "@/components/seller/highlight-manager";
import { loadSellerWorkspace } from "@/lib/seller";
import { activeStoriesForSeller, highlightsForSeller } from "@/lib/seller-stories";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.stories");
  return { title: t("title") };
}

/**
 * `/food/stories` — Fresh Today posting tools + the Menu shelf manager
 * (architecture Part E2, Slice 15's own brief). Route name stays generic per
 * that brief's own instruction; the UI is entirely "Fresh Today" / "En la
 * cocina hoy" — no user-facing "story" wording anywhere on this page.
 *
 * ⚠ No status gate beyond having a `FoodSeller` row at all — a PENDING seller
 * can post here exactly as one can create listings (Slice 14's identical
 * call). Posting has no buyer-facing effect until the seller is ACTIVE
 * (`sellerStoryQueue`/`sellerActiveStories` both require it), so there is
 * nothing to protect by blocking it earlier — a seller building momentum
 * ahead of approval is the intended flow, not a state to guard against.
 */
export default async function SellerStoriesPage() {
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/setup");
  const { seller } = workspace;

  const [listings, storyRows, highlightRows] = await Promise.all([
    prisma.foodListing.findMany({
      where: { sellerId: seller.id, active: true },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    activeStoriesForSeller(seller.id),
    highlightsForSeller(seller.id),
  ]);

  const activeStories: ActiveStoryRow[] = storyRows.map((s) => ({
    id: s.id,
    pathThumb: s.pathThumb,
    blurDataUrl: s.blurDataUrl,
    caption: s.caption,
    expiresAt: s.expiresAt.toISOString(),
    highlightId: s.highlightId,
    linkedListing: s.linkedListing,
    viewCount: s._count.views,
  }));

  const highlights = highlightRows.map((h) => ({
    id: h.id,
    title: h.title,
    stories: h.stories.map((s) => ({ id: s.id, pathThumb: s.pathThumb, blurDataUrl: s.blurDataUrl })),
  }));

  const t = await getTranslations("seller.stories");

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>
        <p className="max-w-prose text-body text-ink">{t("intro")}</p>
      </header>

      <StoryPostForm listings={listings} />

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-h2 font-semibold text-ink">{t("activeTitle")}</h2>
        <ActiveStoriesList stories={activeStories} highlights={highlights.map((h) => ({ id: h.id, title: h.title }))} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-h2 font-semibold text-ink">{t("shelfTitle")}</h2>
          <p className="max-w-prose text-label text-ink">{t("shelfIntro")}</p>
        </div>
        <HighlightManager highlights={highlights} />
      </section>
    </>
  );
}
