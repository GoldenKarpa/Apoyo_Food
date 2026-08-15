import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { ListingForm } from "@/components/seller/listing-form";
import { ListingActiveToggle } from "@/components/seller/listing-active-toggle";
import { ListingPhotoManager } from "@/components/seller/listing-photo-manager";
import { AvailabilityWindowForm } from "@/components/seller/availability-window-form";
import { AvailabilityWindowList } from "@/components/seller/availability-window-list";
import { getFoodSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { loadSellerWorkspace } from "@/lib/seller";
import { listingForEdit, sellerCategoryOptions } from "@/lib/listing";
import { MAX_WINDOWS_PER_LISTING } from "@/lib/availability-window-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("seller.listingForm");
  const { id } = await params;

  // ⚠ Ownership-scoped, not a bare `findUnique(id)` — an unscoped lookup would
  // leak another seller's (possibly still-PENDING) listing title into a
  // probed URL's browser tab, the same class of leak Slice 16's
  // `adminMayLoadData()` warning exists to prevent on the admin surface.
  const session = await getFoodSession();
  if (!session) return { title: t("editTitle") };
  const seller = await prisma.foodSeller.findUnique({ where: { userId: session.userId }, select: { id: true } });
  if (!seller) return { title: t("editTitle") };
  const listing = await prisma.foodListing.findFirst({
    where: { id, sellerId: seller.id },
    select: { title: true },
  });
  return { title: listing?.title ?? t("editTitle") };
}

/**
 * `/food/listings/[id]` — the edit page, and where photos + availability
 * windows actually get attached (`/food/listings/new` only has the base form).
 *
 * ⚠ Ownership is checked by re-resolving `{ id, sellerId }` (via
 * `listingForEdit`), never by trusting that reaching this URL means anything —
 * a listing id lifted from a rival's edit-page URL 404s here exactly like a
 * PENDING seller's public profile 404s on `/sellers/[slug]` (Slice 9's
 * visibility rule, the same instinct applied to a different surface).
 */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("seller.listingForm");
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/setup");

  const [listing, categories] = await Promise.all([
    listingForEdit(id, workspace.seller.id),
    sellerCategoryOptions(),
  ]);
  if (!listing) notFound();

  const isPublic = listing.active && workspace.seller.status === "ACTIVE";

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-display font-semibold text-ink">{listing.title}</h1>
          {listing.takenDownAt ? (
            <p className="text-caption font-medium text-error">{t("takenDownNotice")}</p>
          ) : isPublic ? (
            <Link href={`/meals/${listing.slug}`} className="text-label text-green hover:underline">
              {t("viewPublic")}
            </Link>
          ) : (
            <p className="text-caption text-ink">
              {!listing.active ? t("hiddenInactive") : t("hiddenSellerPending")}
            </p>
          )}
        </div>
        {!listing.takenDownAt && <ListingActiveToggle listingId={listing.id} active={listing.active} />}
      </header>

      <section className="rounded-card border border-hairline bg-card p-6">
        <ListingForm categories={categories} initial={{ ...listing, categoryIds: listing.categories.map((c) => c.categoryId) }} />
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-6">
        <h2 className="font-display text-h2 font-semibold text-ink">{t("photosTitle")}</h2>
        <ListingPhotoManager listingId={listing.id} photos={listing.photos} />
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-h2 font-semibold text-ink">{t("availabilityTitle")}</h2>
          <p className="max-w-prose text-label text-ink">{t("availabilityIntro")}</p>
        </div>
        <AvailabilityWindowList listingId={listing.id} windows={listing.availabilityWindows} />
        {listing.availabilityWindows.length < MAX_WINDOWS_PER_LISTING && (
          <AvailabilityWindowForm listingId={listing.id} />
        )}
      </section>

      <div>
        <Button variant="ghost" asChild>
          <Link href="/food/listings">{t("back")}</Link>
        </Button>
      </div>
    </>
  );
}
