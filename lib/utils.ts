import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * ⚠ `twMerge` MUST be told about this project's custom font-size scale, and
 * getting this wrong is silent and severe. This is inherited, not rediscovered:
 * Apparel shipped the stock `twMerge` from its Slice 1 through Slice 6 and only
 * found the bug in Slice 7 by measuring contrast off the rendered DOM.
 *
 * Part F3's type scale renames the font sizes (`text-display`, `text-h1`,
 * `text-h2`, `text-body`, `text-label`, `text-caption`). Stock tailwind-merge
 * only knows Tailwind's own `text-xs … text-9xl`, so it classifies every one of
 * ours as a **text colour** — putting `text-label` and `text-card` in the same
 * conflict group and dropping whichever came first. In Apparel that silently
 * stripped `text-cream-card` off the primary button's label, leaving inherited
 * ink on the accent fill at 2.67:1 on the most-used control in the app.
 *
 * None of that is visible to `tsc`, to `next lint`, or to a palette-level
 * contrast audit, because every individual token is correct — only the
 * composition is wrong. Keep this list in step with `tailwind.config.ts`'s
 * `fontSize` keys.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "body", "label", "caption"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
