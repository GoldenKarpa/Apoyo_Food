import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The availability **stamp** — architecture Part F3's "market-stamp pill".
 *
 * It is the component that carries Food's core anti-waste stance visually: a
 * listing never says "in stock", it says *when it can be had* ("Fin de semana",
 * "Por encargo · 2 días", "Solo festivos"). The copy is always supplied by the
 * caller; Slice 14's `lib/availability.ts` computes it from the listing's
 * windows in the fixed America/Port_of_Spain zone. This component only decides
 * how it looks.
 *
 * ── Two sizes, because the mockups show two ──
 * `sm` is the small solid pill sitting beside the price on a `<MealCard>`
 * (Emergent `food (10)`/`food (9)`). `lg` is the ticket-shaped market stamp with
 * dot flourishes on the listing-detail page (Emergent `food (7)`), where it is a
 * signature element rather than a label.
 *
 * ── ⚠ A measured divergence from Part F3's letter, kept true to its intent ──
 * Part F3 says stamps render as "ink text on a `-vivid` fill". That is correct
 * for exactly one of the four vivid fills. Part F3's own table measures ink on
 * `green-vivid` at **3.10:1**, `terracotta-vivid` **3.64**, `teal-vivid` **3.80**
 * — all below the 4.5 bar for normal text, and it labels them "large/bold labels
 * & icons only". A stamp on a card is caption-sized, so three of the four
 * families would have shipped failing AA.
 *
 * So the stamp takes the **text-safe** accent instead:
 *   - `sm`: accent FILL with a `card`-cream label — 5.44 / 5.49 / 5.53 / 5.72:1
 *     (Part F3's own "vs card" column; WCAG contrast is symmetric, so a cream
 *     label on the accent is the same number as the accent as text on cream).
 *   - `lg`: the accent's `-soft` tint with accent text and an accent border —
 *     4.52–4.72:1 (Part F3's "vs own -soft" column).
 * Both are *more* saturated than an inaccessible vivid fill would have been at
 * this size, and `sm` is what the mockups' own card pills actually look like.
 * `gold-vivid` keeps its sanctioned home on `<StatusChip tone="pending">`, where
 * ink measures 6.55:1 and Part F3 says it belongs.
 */

/**
 * The availability families Part F3 names, in its own colour order. Deliberately
 * NOT the `AvailabilityType` enum: a DATE_RANGE window is `seasonal` when it is
 * a holiday menu and `available` when it is this week, and that is a computation
 * (Slice 14) rather than a column.
 */
export type AvailabilityTone = "available" | "recurring" | "preorder" | "seasonal";

const TONE_CLASSES: Record<AvailabilityTone, { sm: string; lg: string; dot: string }> = {
  // Fresh right now — teal, the same token that carries the Fresh Today dot.
  available: { sm: "bg-teal text-card", lg: "bg-teal-soft text-teal border-teal", dot: "bg-teal" },
  // "Fin de semana", "Diario" — the anchor green.
  recurring: {
    sm: "bg-green text-card",
    lg: "bg-green-soft text-green border-green",
    dot: "bg-green",
  },
  // "Por encargo · 2 días" — gold.
  preorder: { sm: "bg-gold text-card", lg: "bg-gold-soft text-gold border-gold", dot: "bg-gold" },
  // "Solo festivos" — terracotta.
  seasonal: {
    sm: "bg-terracotta text-card",
    lg: "bg-terracotta-soft text-terracotta border-terracotta",
    dot: "bg-terracotta",
  },
};

export interface AvailabilityStampProps {
  tone: AvailabilityTone;
  /** Already-localized copy, e.g. "Weekends · order by Friday 4pm". */
  children: React.ReactNode;
  size?: "sm" | "lg";
  className?: string;
}

export function AvailabilityStamp({
  tone,
  children,
  size = "sm",
  className,
}: AvailabilityStampProps) {
  const classes = TONE_CLASSES[tone];

  if (size === "lg") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-pill border-2 px-4 py-1.5 text-label font-medium",
          classes.lg,
          className,
        )}
      >
        {/* The market-stamp flourish — a punched dot either side of the text,
            which is what makes this read as a stamp rather than a chip. */}
        <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-pill", classes.dot)} />
        {children}
        <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-pill", classes.dot)} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-0.5 text-caption font-medium",
        classes.sm,
        className,
      )}
    >
      {children}
    </span>
  );
}
