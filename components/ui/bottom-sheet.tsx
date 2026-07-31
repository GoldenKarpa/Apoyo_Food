"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * The single overlay primitive for the whole app (architecture Part F3:
 * "filter UIs as bottom sheets, not sidebars").
 *
 * `<ComingSoon>` and the filter sheet both render one of these rather than a
 * modal and a separately-behaved sheet — two overlay components inevitably
 * diverge in focus handling, animation and close affordances.
 *
 * ── One component, two forms ──
 * Below 768px it is a true bottom sheet: bottom-anchored, rounded top corners,
 * grab handle, sliding up. From 768px it becomes a centred card that fades and
 * scales in. That split is deliberate: a panel already mid-screen sliding up
 * from the bottom edge reads as a different component, and a full-width
 * bottom-anchored sheet on a 1280px display looks like a mistake.
 *
 * ── Why Radix rather than hand-rolled ──
 * Focus trapping, focus restoration on close, Escape, scroll lock, `aria-modal`
 * and the title/description wiring are all things this slice's a11y sweep would
 * otherwise find missing. Radix's Presence is also what makes the exit
 * animation possible — it keeps a closing sheet mounted until the CSS animation
 * named on it finishes, which is why `tailwind.config.ts` carries `sheet-down`
 * and `modal-out` and not only the entering halves.
 *
 * Part F3 motion: 200–300ms ease-out, no bounce. Never a spinner.
 */

const BottomSheet = DialogPrimitive.Root;
const BottomSheetTrigger = DialogPrimitive.Trigger;
const BottomSheetClose = DialogPrimitive.Close;

const BottomSheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
      className,
    )}
    {...props}
  />
));
BottomSheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface BottomSheetContentProps
  // `title` is omitted from the underlying element props because this component
  // takes the name over: it is the sheet's <Dialog.Title>, not the DOM `title`
  // tooltip attribute, and it accepts a node rather than a string.
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "title"> {
  /** Rendered as the sheet's `<Dialog.Title>` — required for a11y, never optional. */
  title: React.ReactNode;
  /** Optional supporting line beneath the title. */
  description?: React.ReactNode;
  /** Set false for a sheet whose only exit is an explicit action. */
  showClose?: boolean;
}

const BottomSheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  BottomSheetContentProps
>(({ className, children, title, description, showClose = true, ...props }, ref) => {
  const t = useTranslations("common");

  return (
    <DialogPrimitive.Portal>
      <BottomSheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Mobile: bottom-anchored sheet.
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-4 overflow-y-auto",
          "rounded-t-card bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-soft",
          "data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down",
          // >=768px: centred card. `inset-x-auto` undoes the mobile full-bleed
          // anchoring; without it the left/right insets keep stretching the
          // panel across the whole viewport.
          "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md",
          "md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:pb-6",
          "md:data-[state=open]:animate-modal-in md:data-[state=closed]:animate-modal-out",
          className,
        )}
        {...props}
      >
        {/* Grab handle — the "drag me" affordance, so it belongs to the mobile
            form only. Decorative, hence aria-hidden. */}
        <div
          aria-hidden
          className="mx-auto -mt-2 h-1 w-10 shrink-0 rounded-pill bg-hairline md:hidden"
        />

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="font-display text-h1 font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-body text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              // Radix warns when a dialog has no description; opting out
              // explicitly is the documented way to say "there isn't one".
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>

          {showClose && (
            <DialogPrimitive.Close
              aria-label={t("close")}
              className="tap-target -mr-2 -mt-2 flex shrink-0 items-center justify-center rounded-pill text-ink transition-colors duration-200 ease-soft hover:bg-sunken"
            >
              <X aria-hidden className="h-5 w-5" />
            </DialogPrimitive.Close>
          )}
        </div>

        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
BottomSheetContent.displayName = DialogPrimitive.Content.displayName;

/** Action row for a sheet — stacked on mobile, where thumbs are. */
function BottomSheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-3", className)} {...props} />;
}

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
};
