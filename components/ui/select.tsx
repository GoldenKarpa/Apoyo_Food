import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sobremesa select — a plain native `<select>`, styled to match `<Input>`
 * exactly (same border/radius/`sunken` surface/contrast rule).
 *
 * A native element on purpose: the listing form's `kind`/`priceMode` pickers
 * and the window builder's `type` picker are short, closed lists with no need
 * for search or multi-select, and a native `<select>` gets keyboard operation,
 * screen-reader semantics and mobile-native picker UI for free — a custom
 * listbox would have to rebuild all three to match it. First real caller:
 * Slice 14's listing form.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-[44px] w-full appearance-none rounded-control border border-hairline bg-sunken px-4 pr-10 text-body text-ink transition-colors duration-200 ease-soft disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink"
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
