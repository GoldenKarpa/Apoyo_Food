"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { toggleFollowSeller } from "@/lib/actions/follow-seller";
import { cn } from "@/lib/utils";

/**
 * The seller profile's "Seguir / Follow" button (Slice 11, `food (9)`'s own
 * mockup — a compact pill beside the name/follower-count, not a full-width
 * bar). Same optimistic-then-confirm shape as `<SaveButton>`, including the
 * anonymous case: an inline hint, never a redirect (see
 * `lib/actions/follow-seller.ts`'s comment for why).
 *
 * ⚠ `followerCount` is DISPLAYED on this same page, so the click handler takes
 * the server's recounted number rather than incrementing/decrementing a prop
 * locally — `onFollowerCountChange` is how the page keeps its own header in
 * sync without a full reload.
 */
export function FollowButton({
  sellerId,
  initialFollowing,
  authenticated,
  onFollowerCountChange,
  className,
}: {
  sellerId: string;
  initialFollowing: boolean;
  authenticated: boolean;
  onFollowerCountChange?: (count: number) => void;
  className?: string;
}) {
  const t = useTranslations("client.sellerProfile");
  const [following, setFollowing] = React.useState(initialFollowing);
  const [showHint, setShowHint] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const hintTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  function flashHint() {
    setShowHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setShowHint(false), 3000);
  }

  function handleClick() {
    if (!authenticated) {
      flashHint();
      return;
    }

    const next = !following;
    setFollowing(next); // optimistic
    startTransition(async () => {
      const result = await toggleFollowSeller(sellerId);
      if (result.ok) {
        setFollowing(result.following);
        onFollowerCountChange?.(result.followerCount);
      } else {
        setFollowing(!next); // revert — e.g. a session that expired mid-click
        flashHint();
      }
    });
  }

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant={following ? "outline" : "primary"}
        size="md"
        onClick={handleClick}
        aria-pressed={following}
      >
        {following ? t("following") : t("follow")}
      </Button>

      {showHint && (
        <p
          role="status"
          className="absolute right-0 top-full z-10 mt-2 w-44 rounded-control bg-ink px-3 py-2 text-caption text-card shadow-soft"
        >
          {authenticated ? t("followFailed") : t("signInToFollow")}
        </p>
      )}
    </div>
  );
}
