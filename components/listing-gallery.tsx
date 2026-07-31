"use client";

import * as React from "react";

import { FoodImage } from "@/components/food-image";
import { cn } from "@/lib/utils";

/**
 * `/meals/[slug]`'s gallery (Slice 10, Part F1: "gallery (swipe)").
 *
 * The main pane is a native horizontal scroll-snap track — real touch swipe on
 * a phone, no gesture library — with a thumbnail strip beneath it that both
 * mirrors and drives the active slide. `<FoodImage>`'s aspect lock (4:3, the
 * `meal` role) keeps every photo the same frame regardless of what a seller
 * uploaded, exactly as it does on a `<MealCard>`.
 *
 * Full-resolution (`pathFull`) in the main pane, `pathCard` in the thumbnails —
 * the same split Slice 4's ingest pipeline exists to produce: a detail page's
 * hero deserves more pixels than a card ever needs.
 */

export interface ListingGalleryPhoto {
  /** `pathFull` — the hero slide. */
  full: string;
  /** `pathCard` — the thumbnail. */
  card: string;
  blurDataUrl?: string | null;
  alt?: string | null;
}

export function ListingGallery({
  photos,
  title,
}: {
  photos: ListingGalleryPhoto[];
  title: string;
}) {
  const [active, setActive] = React.useState(0);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const slideRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  function scrollTo(index: number) {
    slideRefs.current[index]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    setActive((prev) => (prev === index ? prev : index));
  }

  if (photos.length === 0) {
    // No photo is a real state (a seller mid-onboarding, Slice 13) — a sunken
    // frame at the right ratio, not a collapsed gap.
    return <div aria-hidden className="aspect-meal w-full rounded-image bg-sunken" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="rail-scroll flex snap-x snap-mandatory overflow-x-auto rounded-image"
      >
        {photos.map((photo, index) => (
          <div
            key={photo.full}
            ref={(el) => {
              slideRefs.current[index] = el;
            }}
            className="w-full shrink-0 snap-start snap-always"
          >
            <FoodImage
              src={photo.full}
              alt={photo.alt ?? title}
              aspect="meal"
              blurDataUrl={photo.blurDataUrl}
              sizes="(min-width: 768px) 50vw, 100vw"
              priority={index === 0}
              className="rounded-none"
            />
          </div>
        ))}
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label={title}>
          {photos.map((photo, index) => (
            <button
              key={photo.full}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-label={`${index + 1}/${photos.length}`}
              onClick={() => scrollTo(index)}
              className={cn(
                "tap-target shrink-0 overflow-hidden rounded-image border-2 transition-colors duration-200 ease-soft",
                active === index ? "border-green" : "border-transparent",
              )}
            >
              <FoodImage
                src={photo.card}
                alt=""
                aspect="thumb"
                blurDataUrl={photo.blurDataUrl}
                sizes="64px"
                className="h-16 w-16 rounded-none"
                imageClassName="rounded-none"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
