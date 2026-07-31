import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { ACCENT_CLASSES, categoryAccent } from "@/lib/category-accent";
import { cn } from "@/lib/utils";

/**
 * Sobremesa chips (architecture Part F3): **full-pill, always** — chips and
 * buttons share that shape, and it is the main divergence from Apparel's
 * 12px-radius controls.
 *
 * Three jobs, three components, because they carry different rules:
 *  - `<Chip>`         — neutral/soft/outline/selected. Filter toggles, dietary
 *                       and ingredient tags, area labels.
 *  - `<CategoryChip>` — tinted by the Part F3 category→accent family.
 *  - `<StatusChip>`   — order/seller state. The one sanctioned home of
 *                       `gold-vivid` (see below).
 *
 * Contrast, measured rather than assumed. `ink` on every `-soft` tint is
 * 10.97–11.98:1; `card`-cream on `green` is 5.44:1; `ink` on `sunken` is 12.1:1.
 * ⚠ `ink-muted` never appears on `sunken` anywhere in this file — it measures
 * 4.37:1 there, the one documented gap in the palette (Slice 1).
 */
const chipVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1 text-caption font-medium transition-colors duration-200 ease-soft",
  {
    variants: {
      variant: {
        /** Default resting chip: sunken fill, full ink. */
        neutral: "bg-sunken text-ink",
        /** A quieter chip on a card that is already sunken-adjacent. */
        outline: "border border-hairline bg-transparent text-ink",
        /** Chosen filter value — the anchor green, per Part F3's anchor rule. */
        selected: "bg-green text-card",
      },
      size: {
        sm: "px-3 py-1 text-caption",
        /** Tap-target size, for anything actually clickable (>=44px, Part F3). */
        md: "tap-target px-4 py-2 text-label",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  /**
   * Merge the styling into the child element instead of rendering a `<span>`.
   * Needed wherever a chip is interactive (the filter sheet's pill toggles) —
   * a `<span onClick>` is not a control, and a `<button>` inside a `<span>` is
   * a nested-interactive shape the parser is free to restructure.
   */
  asChild?: boolean;
}

export function Chip({ className, variant, size, asChild = false, ...props }: ChipProps) {
  const Comp = asChild ? Slot : "span";
  return <Comp className={cn(chipVariants({ variant, size, className }))} {...props} />;
}

/**
 * A chip tinted by its category's Part F3 accent family.
 *
 * `selected` fills with the accent and takes a `card`-cream label (5.44–5.72:1
 * measured); unselected uses the accent's `-soft` tint with ink (≈11:1). Both
 * clear AA at caption size, which the `-vivid` fills would NOT — ink on
 * `green-vivid` is 3.10:1, large/bold only.
 */
export interface CategoryChipProps extends React.ComponentProps<"button"> {
  category: { slug: string; seasonal?: boolean } | string;
  label: string;
  selected?: boolean;
  /** Render as a static span (a card's category label rather than a filter). */
  asStatic?: boolean;
}

export function CategoryChip({
  category,
  label,
  selected = false,
  asStatic = false,
  className,
  ...props
}: CategoryChipProps) {
  const accent = ACCENT_CLASSES[categoryAccent(category)];
  const classes = cn(
    "inline-flex items-center whitespace-nowrap rounded-pill px-4 py-2 text-label font-medium transition-colors duration-200 ease-soft",
    selected ? accent.fill : accent.soft,
    !asStatic && "tap-target",
    className,
  );

  if (asStatic) {
    return <span className={classes}>{label}</span>;
  }

  return (
    <button type="button" aria-pressed={selected} className={classes} {...props}>
      {label}
    </button>
  );
}

/**
 * Status chip (architecture Part F3: "Pending = gold-vivid fill + ink,
 * Accepted = green, Declined = error, Completed = muted").
 *
 * ⚠ This is the ONE place `gold-vivid` — the retained bright Emergent marigold —
 * carries text, and it is safe precisely here: ink on `gold-vivid` measures
 * **6.55:1**, the best of the four vivid fills and the only one that clears AA
 * at normal text size. The other three vivids stay decorative. Part F3 reaches
 * the same conclusion from the other direction ("the right choice for a status
 * chip *fill* with dark ink lettering").
 *
 * Slice 17 owns the real order lifecycle; the tones are fixed here so that slice
 * inherits them rather than re-deciding under deadline.
 */
export type StatusTone = "pending" | "accepted" | "declined" | "completed";

const STATUS_CLASSES: Record<StatusTone, string> = {
  pending: "bg-gold-vivid text-ink", //   6.55:1
  accepted: "bg-green text-card", //      5.44:1
  declined: "bg-error text-card", //      5.44:1
  completed: "bg-sunken text-ink", //    12.10:1
};

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1 text-caption font-medium",
        STATUS_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
