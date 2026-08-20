"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useFoodActions } from "@/lib/actions/registry";

/**
 * `completeOrder`'s trigger — a plain confirm button, no reason field (unlike
 * decline/cancel, Part E5 gives completion no reason to collect). Kept
 * separate from `<OrderReasonAction>` rather than folded into a third `spec`
 * variant there: the two are genuinely different interaction shapes (reveal-
 * a-form vs a single click), and combining them would mean the simpler one
 * inherits state (`expanded`, `reason`) it never uses.
 */
export function OrderCompleteButton({
  orderId,
  label,
  confirmMessage,
  errorLabel,
}: {
  orderId: string;
  label: string;
  confirmMessage: string;
  errorLabel: string;
}) {
  const router = useRouter();
  const actions = useFoodActions();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState(false);

  async function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    setPending(true);
    setError(false);
    const result = await actions.completeOrder(orderId);
    setPending(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button type="button" onClick={handleClick} disabled={pending}>
        {pending ? "…" : label}
      </Button>
      {error && <p className="mt-1 text-caption text-error">{errorLabel}</p>}
    </div>
  );
}
