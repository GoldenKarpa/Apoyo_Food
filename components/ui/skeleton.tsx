import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Loading placeholders — architecture Part F3: **"Never spinners on the browse
 * surface — skeletons + blur-up only."**
 *
 * That rule is why this file exists at Slice 7 rather than being improvised per
 * page later: a spinner is what a developer reaches for when there is no
 * skeleton to hand, so the skeleton has to exist first. Each card component in
 * this library ships its matching skeleton beside it, shaped to the same
 * geometry, so a loading grid holds its layout instead of reflowing when data
 * lands.
 *
 * The shimmer is `animate-pulse` on the `sunken` surface — Tailwind's own
 * keyframe, already in the bundle, and it respects `prefers-reduced-motion`
 * through the media query Tailwind emits for `motion-reduce`. Nothing here
 * carries text, so there is no contrast surface to audit.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-image bg-sunken", className)} {...props} />;
}

/** Matches `<MealCard>`: 4:3 image, two title lines, a price/stamp row. */
export function MealCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-3 shadow-soft">
      <Skeleton className="aspect-meal w-full" />
      <div className="flex flex-col gap-2 px-1 pb-1">
        <Skeleton className="h-4 w-4/5 rounded-pill" />
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-20 rounded-pill" />
          <Skeleton className="h-4 w-24 rounded-pill" />
        </div>
      </div>
    </div>
  );
}

/** Matches `<FreshTodayCard>`: 4:5 portrait frame with a caption line beneath. */
export function FreshTodayCardSkeleton() {
  return (
    <div className="flex w-[9.5rem] shrink-0 flex-col gap-2 rounded-card border border-hairline bg-card p-2 shadow-soft">
      <Skeleton className="aspect-[4/5] w-full" />
      <Skeleton className="mx-1 mb-1 h-3 w-4/5 rounded-pill" />
    </div>
  );
}

/** Matches `<SellerCard>`: 16:9 cover, overlapping avatar, name + area chips. */
export function SellerCardSkeleton() {
  return (
    <div className="flex flex-col rounded-card border border-hairline bg-card shadow-soft">
      <Skeleton className="aspect-cover w-full rounded-b-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="-mt-10 h-16 w-16 rounded-pill border-4 border-card" />
        <Skeleton className="h-4 w-2/3 rounded-pill" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-pill" />
          <Skeleton className="h-6 w-16 rounded-pill" />
        </div>
      </div>
    </div>
  );
}
