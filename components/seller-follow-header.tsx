"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { FollowButton } from "@/components/ui/follow-button";

/**
 * Keeps the profile's own "N followers" text in sync with `<FollowButton>`'s
 * optimistic toggle, without making the whole `/sellers/[slug]` page a Client
 * Component — this one small header block is, the rest of the page stays a
 * Server Component render.
 */
export function SellerFollowHeader({
  sellerId,
  initialFollowing,
  initialFollowerCount,
  authenticated,
}: {
  sellerId: string;
  initialFollowing: boolean;
  initialFollowerCount: number;
  authenticated: boolean;
}) {
  const t = useTranslations("client.sections");
  const [count, setCount] = React.useState(initialFollowerCount);

  return (
    <div className="flex items-center gap-3">
      <FollowButton
        sellerId={sellerId}
        initialFollowing={initialFollowing}
        authenticated={authenticated}
        onFollowerCountChange={setCount}
      />
      <span className="text-label text-ink-muted">{t("followers", { count })}</span>
    </div>
  );
}
