"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { recordStoryView } from "@/lib/actions/mark-story-viewed";
import { cn } from "@/lib/utils";

/**
 * `<FreshTodayViewer>` — the full-screen Fresh Today viewer (Slice 11,
 * architecture Part E2: "full-screen, tap-advance/swipe (seller → seller),
 * progress bars, view-tracking per entry, linked-listing CTA").
 *
 * A real route (`/stories/[sellerSlug]`), not a modal — rendered as a `fixed
 * inset-0 z-50` layer so it visually covers the site chrome without needing a
 * separate route-group layout. `z-50` matches the bottom-sheet overlay's own
 * layer (Slice 7); nothing in this app stacks above a full-screen viewer.
 *
 * ── The auto-advance timer is a plain `setTimeout`, decoupled from the
 *    progress bar's CSS animation, and this is load-bearing, not stylistic ──
 * `globals.css` forces every `animation-duration` to 0.01ms under
 * `prefers-reduced-motion: reduce` (Slice 7). Driving navigation off the
 * progress bar's `onAnimationEnd` would rapid-fire through an entire story in
 * milliseconds for exactly the users that setting is supposed to protect —
 * caught before it shipped, not after. Further: under reduced motion the
 * timer is skipped entirely (WCAG 2.2.2 — auto-advancing content lasting more
 * than 5s must be pausable, and "never starts" is the simplest correct
 * reading of that for a viewer with no explicit pause control in this slice).
 * Manual tap/swipe/keyboard navigation works identically either way.
 *
 * ── Seller → seller continuation, and the one deliberate simplification ──
 * Past the last slide, `router.replace` moves to `nextSellerSlug`'s viewer at
 * ITS first slide — genuine continuation, matching what a viewer tapping
 * through the Fresh Today rail experiences. Going back past the FIRST slide
 * also moves to `prevSellerSlug`, but likewise opens at that seller's first
 * slide rather than their last — true "resume where you left off" backward
 * navigation would need the target route to know which end to start from
 * (a query param, extra plumbing), and this slice's simpler version is a
 * documented, defensible scope cut, not an oversight.
 */

export interface ViewerSlide {
  id: string;
  src: string;
  blurDataUrl: string;
  caption: string | null;
  linkedListing: { slug: string; title: string } | null;
}

const SLIDE_DURATION_MS = 5000;
const SWIPE_THRESHOLD_PX = 60;

export function FreshTodayViewer({
  seller,
  stories,
  nextSellerSlug,
  prevSellerSlug,
}: {
  seller: { slug: string; displayName: string };
  stories: ViewerSlide[];
  nextSellerSlug: string | null;
  prevSellerSlug: string | null;
}) {
  const t = useTranslations("stories");
  const router = useRouter();
  const [index, setIndex] = React.useState(0);
  const dragStart = React.useRef<{ x: number; y: number } | null>(null);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const slide = stories[index];

  const close = React.useCallback(() => {
    router.back();
  }, [router]);

  const goNext = React.useCallback(() => {
    setIndex((current) => {
      if (current < stories.length - 1) return current + 1;
      if (nextSellerSlug) {
        router.replace(`/stories/${nextSellerSlug}`);
        return current;
      }
      close();
      return current;
    });
  }, [stories.length, nextSellerSlug, router, close]);

  const goPrev = React.useCallback(() => {
    setIndex((current) => {
      if (current > 0) return current - 1;
      if (prevSellerSlug) router.replace(`/stories/${prevSellerSlug}`);
      return current;
    });
  }, [prevSellerSlug, router]);

  // View tracking — once per slide shown, per Part E2.
  React.useEffect(() => {
    void recordStoryView(slide.id).catch(() => {});
  }, [slide.id]);

  // The auto-advance timer — see the header comment for why this is a plain
  // `setTimeout`, never the progress bar's own animation event.
  React.useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(goNext, SLIDE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [index, reducedMotion, goNext]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") goNext();
      else if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, close]);

  function handlePointerDown(event: React.PointerEvent) {
    dragStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.abs(dy) > Math.abs(dx) && dy > SWIPE_THRESHOLD_PX) {
      close(); // swipe down dismisses
      return;
    }
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
      if (dx < 0) goNext();
      else goPrev();
      return;
    }

    // Not a swipe — a tap, zoned left/right (Part E2: "tap-advance").
    const rect = event.currentTarget.getBoundingClientRect();
    const tapX = event.clientX - rect.left;
    if (tapX < rect.width / 2) goPrev();
    else goNext();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex touch-none select-none flex-col bg-ink"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className="flex gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {stories.map((story, position) => (
          <div key={story.id} className="h-1 flex-1 overflow-hidden rounded-pill bg-card/30">
            <div
              className={cn(
                "h-full bg-card",
                position < index && "w-full",
                position > index && "w-0",
                position === index && (reducedMotion ? "w-full" : "animate-story-progress"),
              )}
              style={
                position === index && !reducedMotion
                  ? { animationDuration: `${SLIDE_DURATION_MS}ms` }
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-3 pb-2">
        <span className="truncate text-label font-medium text-card">{seller.displayName}</span>
        <button
          type="button"
          aria-label={t("close")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
          className="tap-target flex items-center justify-center text-card"
        >
          <X aria-hidden className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex-1">
        <Image
          src={slide.src}
          alt={slide.caption ?? seller.displayName}
          fill
          sizes="100vw"
          priority
          placeholder={slide.blurDataUrl ? "blur" : undefined}
          blurDataURL={slide.blurDataUrl || undefined}
          className="object-contain"
        />
      </div>

      {(slide.caption || slide.linkedListing) && (
        <div
          className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          {slide.caption && <p className="text-body text-card">{slide.caption}</p>}
          {slide.linkedListing && (
            <Link
              href={`/meals/${slide.linkedListing.slug}`}
              className="tap-target inline-flex w-fit items-center gap-1 rounded-pill bg-card px-4 py-2 text-label font-medium text-ink"
            >
              {t("viewDish", { title: slide.linkedListing.title })}
              <ChevronRight aria-hidden className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
