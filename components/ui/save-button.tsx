"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";

import { toggleSaveListing } from "@/lib/actions/save-listing";
import { cn } from "@/lib/utils";

/**
 * The save/favourite heart (Slice 10, architecture Part C/E4). Renders as an
 * overlay in the top-right corner of whatever it's given — a `<MealCard>`'s
 * photo or the listing-detail gallery's hero slide — since none of the
 * Emergent mockups were drawn with a save affordance on the card itself
 * (`food (7)` puts a heart in a contextual app bar this app's chrome doesn't
 * have; `food (9)`/`food (10)` show none at all). E-commerce convention
 * already trains a buyer to look at a photo's corner, so this places it there
 * rather than inventing a new spot.
 *
 * Optimistic: the heart flips the instant it's tapped, before the Server
 * Action resolves, and reverts only if the action reports failure — a save is
 * exactly the kind of low-stakes toggle where waiting on a round-trip before
 * any visual feedback reads as broken, not careful.
 */
export function SaveButton({
  listingId,
  initialSaved,
  authenticated,
  className,
}: {
  listingId: string;
  initialSaved: boolean;
  authenticated: boolean;
  className?: string;
}) {
  const t = useTranslations("save");
  const [saved, setSaved] = React.useState(initialSaved);
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

  function handleClick(event: React.MouseEvent) {
    // The card underneath is a real `<Link>` sibling, not an ancestor (buttons
    // can't nest inside anchors), but this control still sits visually on top
    // of it — stop propagation so a tap on the heart never also fires a click
    // that happened to land on the card behind it.
    event.preventDefault();
    event.stopPropagation();

    if (!authenticated) {
      flashHint();
      return;
    }

    const next = !saved;
    setSaved(next); // optimistic
    startTransition(async () => {
      const result = await toggleSaveListing(listingId);
      if (result.ok) {
        setSaved(result.saved);
      } else {
        setSaved(!next); // revert — e.g. a session that expired mid-click
        flashHint();
      }
    });
  }

  return (
    <div className={cn("relative z-10", className)}>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved}
        aria-label={saved ? t("unsave") : t("save")}
        className="tap-target flex h-11 w-11 items-center justify-center rounded-pill bg-card shadow-soft transition-colors duration-200 ease-soft hover:bg-terracotta-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        <Heart
          aria-hidden
          className={cn(
            "h-5 w-5 transition-colors duration-200 ease-soft",
            saved ? "fill-terracotta text-terracotta" : "text-ink-muted",
          )}
        />
      </button>

      {showHint && (
        <p
          role="status"
          className="absolute right-0 top-full mt-2 w-44 rounded-control bg-ink px-3 py-2 text-caption text-card shadow-soft"
        >
          {authenticated ? t("saveFailed") : t("signInToSave")}
        </p>
      )}
    </div>
  );
}
