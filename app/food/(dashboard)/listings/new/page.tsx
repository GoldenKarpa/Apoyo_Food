import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { ListingForm } from "@/components/seller/listing-form";
import { loadSellerWorkspace } from "@/lib/seller";
import { sellerCategoryOptions } from "@/lib/listing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.listingForm");
  return { title: t("newTitle") };
}

/**
 * `/food/listings/new` — base fields only. Photos and availability windows
 * both need an existing listing id to attach to, so this page redirects to
 * `/food/listings/[id]` on success (`<ListingForm>`'s own create branch),
 * where the rest of the editor lives.
 */
export default async function NewListingPage() {
  const t = await getTranslations("seller.listingForm");
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/onboarding");

  const categories = await sellerCategoryOptions();

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-display font-semibold text-ink">{t("newTitle")}</h1>
        <p className="max-w-prose text-body text-ink">{t("newIntro")}</p>
      </header>

      <ListingForm categories={categories} />

      <div>
        <Button variant="ghost" asChild>
          <Link href="/food/listings">{t("back")}</Link>
        </Button>
      </div>
    </>
  );
}
