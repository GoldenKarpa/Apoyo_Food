import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Sobremesa button (architecture Part F3).
 *
 * Two rules from Part F3 are encoded here rather than left to call sites:
 *  - **Full-pill**, always. Buttons and chips are pill-shaped in this system;
 *    that is the main shape divergence from Apparel's 12px controls.
 *  - **Primary is `green`, on every screen.** Part F3's anchor rule is
 *    non-negotiable: navigation, active tab, primary buttons and default CTAs
 *    never take the category accent, so category/seasonal theming can never
 *    destabilise wayfinding.
 *
 * Contrast, measured (not assumed) at Slice 1: `card`-cream label on the `green`
 * fill is 5.44:1, and on `error` 5.44:1 — both clear the 4.5 bar. The outline
 * and ghost variants carry `green`/`ink` text on cream surfaces (4.98–12.73:1).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-label font-medium transition-colors duration-200 ease-soft disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-green text-card hover:bg-green/90",
        secondary: "bg-green-soft text-ink hover:bg-green-soft/80",
        outline: "border border-green bg-transparent text-green hover:bg-green-soft",
        ghost: "bg-transparent text-ink hover:bg-sunken",
        destructive: "bg-error text-card hover:bg-error/90",
      },
      size: {
        // Every size clears the >=44px tap target Part F3 requires; `sm` reaches
        // it via the .tap-target min-height rather than by padding alone.
        sm: "tap-target px-4 py-2",
        md: "min-h-[44px] px-5 py-2.5",
        lg: "min-h-[52px] px-6 py-3 text-body",
        icon: "tap-target p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
