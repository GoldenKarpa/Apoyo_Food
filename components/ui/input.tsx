import * as React from "react";

import { cn } from "@/lib/utils";

// Sobremesa input: 14px radius on the sunken surface (Part F3).
// ⚠ Text is full `ink`, never `ink-muted` — ink-muted measures 4.37:1 on
// `sunken`, below the 4.5 bar. The placeholder is the one deliberate exception
// (placeholder text is not content, and WCAG does not require it to pass), but
// entered values must always be readable.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex min-h-[44px] w-full rounded-control border border-hairline bg-sunken px-4 py-2 text-body text-ink transition-colors duration-200 ease-soft placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
