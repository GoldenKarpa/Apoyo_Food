import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Section header for the composed discovery sections (architecture Part E1).
 *
 * ⚠ **The handwritten accent is rationed here, structurally.** Part F3 allows
 * the script face (Caveat) *only* for occasional section labels like "En la
 * cocina hoy" — never body, buttons, prices or data — at a maximum of one or two
 * per screen. Making it a `script` prop on the one component that renders
 * section titles means the rule lives in one place: a page can only over-use it
 * by asking for it repeatedly and visibly, and no other component in the library
 * can reach for `font-hand` at all.
 *
 * The script variant is `terracotta` on cream (5.25:1) at h1 size, matching the
 * Emergent home mockup. Everything else is the display serif in ink.
 */
export interface SectionHeaderProps {
  title: string;
  /** Optional supporting line — Part F3's ~30% Spanish expansion budget applies. */
  note?: string;
  /** Render the title in the handwritten accent. Rationed — see above. */
  script?: boolean;
  /** "See all" affordance. Given an href it is a link; omit it for no action. */
  action?: { href: string; label: string };
  className?: string;
  /** Heading level. Sections beneath a page `<h1>` should stay `h2`. */
  as?: "h1" | "h2" | "h3";
}

export function SectionHeader({
  title,
  note,
  script = false,
  action,
  className,
  as: Heading = "h2",
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Heading
          className={cn(
            script
              ? "font-hand text-h1 font-normal text-terracotta"
              : "font-display text-h1 font-semibold text-ink",
          )}
        >
          {title}
        </Heading>
        {note && <p className="text-label text-ink-muted">{note}</p>}
      </div>

      {action && (
        <Link
          href={action.href}
          // >=44px in both directions without looking like a button: the
          // negative right margin lets the text sit flush with the grid while
          // the hit area still extends past it (Part F3 tap-target rule).
          className="tap-target -mr-3 flex shrink-0 items-center gap-0.5 rounded-pill px-3 text-label font-medium text-green transition-colors duration-200 ease-soft hover:bg-green-soft"
        >
          {action.label}
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
