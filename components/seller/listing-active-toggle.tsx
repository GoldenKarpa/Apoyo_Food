"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import { toggleListingActive } from "@/lib/actions/upsert-listing";

/**
 * The pause switch — independent of `<ListingForm>` on purpose (see that
 * component's own note): flips immediately, no "Save" required, because a
 * seller pausing a sold-out dish shouldn't have to touch anything else about
 * it. Shared between the list page (one per row) and the edit page header.
 */
export function ListingActiveToggle({ listingId, active }: { listingId: string; active: boolean }) {
  const t = useTranslations("seller.listings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={pending}
        label={t(active ? "deactivate" : "activate")}
        onCheckedChange={() => {
          startTransition(async () => {
            await toggleListingActive(listingId);
            router.refresh();
          });
        }}
      />
      <span className="text-caption text-ink">{t(active ? "active" : "inactive")}</span>
    </div>
  );
}
