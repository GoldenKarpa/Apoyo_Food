import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The horizontal snap rail (architecture Part E1: every home section is "a
 * horizontal card rail or grid block").
 *
 * Deliberately generic. Part E2 mandates the *name* `<FreshTodayRail>` for the
 * home board specifically, and Slice 9 composes that from this plus
 * `<FreshTodayCard>`; the same primitive carries "New this week", "More from
 * this seller" and "Similar in {category}" (Slice 10). One scroller, one set of
 * behaviours.
 *
 * Three details that are easy to get wrong and are therefore encoded here:
 *
 *  - **Scroll snapping** (`snap-x snap-mandatory` + `snap-start` on children) so
 *    a flick lands on a card edge rather than mid-card. `scroll-pl-*` matches
 *    the screen padding, otherwise the first card snaps flush to the viewport
 *    edge and loses the gutter.
 *  - **Full-bleed on mobile.** The rail scrolls edge-to-edge (negative margin +
 *    matching padding) while the page keeps its 16px gutter — a rail that stops
 *    at the gutter reads as clipped rather than continuing off-screen.
 *  - **Keyboard reachability.** A horizontally scrolling region that is not
 *    focusable is unreachable without a mouse or touch; `tabIndex={0}` plus a
 *    group role and label is the standard remedy, and Part F3 explicitly
 *    requires Fresh Today content to be reachable without gesture-only
 *    navigation.
 *
 * Scrollbar chrome is hidden via `.rail-scroll` in globals.css rather than a
 * plugin — the affordance is the peeking next card, which is why the last item
 * gets trailing padding.
 */
export interface RailProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accessible name for the scroll region, e.g. the section heading. */
  label: string;
  children: React.ReactNode;
}

export function Rail({ label, className, children, ...props }: RailProps) {
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "rail-scroll -mx-screen flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-screen px-screen pb-1",
        "md:-mx-screen-md md:scroll-pl-screen-md md:gap-4 md:px-screen-md",
        className,
      )}
      {...props}
    >
      {React.Children.map(children, (child) =>
        child == null ? child : <div className="snap-start">{child}</div>,
      )}
    </div>
  );
}
