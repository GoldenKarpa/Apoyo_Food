import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Sobremesa textarea — `<Input>`'s multi-line sibling, sharing its surface,
 * radius and the same contrast rule.
 *
 * ⚠ Text is full `ink`, never `ink-muted`: `ink-muted` measures 4.37:1 on the
 * `sunken` surface, below the 4.5 bar (the one documented gap in the Slice 1
 * palette). The placeholder is the deliberate exception — placeholder text is
 * not content — but anything a seller has actually typed must be readable.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[132px] w-full rounded-control border border-hairline bg-sunken px-4 py-3 text-body text-ink transition-colors duration-200 ease-soft placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
