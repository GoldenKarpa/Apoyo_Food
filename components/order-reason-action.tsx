"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { declineOrder, cancelOrder } from "@/lib/actions/order";
import type { OrderActor } from "@/lib/order-status";

/**
 * The two order transitions that take a free-form reason (Part E5: decline
 * "reason optional", cancellation "always with a notification; free-form
 * reason") — one component shared by BOTH surfaces, exactly like
 * `<AdminActionButton>`'s `spec` pattern (`components/admin/admin-action-
 * button.tsx`): a plain serializable `spec`, never a closure over a Server
 * Action handed down from a Server Component parent, which is what makes it
 * safe to import directly from either `/orders/[id]` (client surface) or
 * `/food/orders/[id]` (seller surface) with no risk of the "functions cannot
 * be passed to Client Components" RSC error that pattern exists to avoid.
 *
 * All copy is a PROP, not read from a fixed `useTranslations` namespace —
 * the two call sites default to different locales (`client.*` vs
 * `seller.*`), so translation resolution stays with the caller.
 */
export type OrderReasonActionSpec =
  | { kind: "decline"; orderId: string }
  | { kind: "cancel"; orderId: string; actor: OrderActor };

async function runAction(spec: OrderReasonActionSpec, reason: string): Promise<{ ok: boolean }> {
  if (spec.kind === "decline") return declineOrder(spec.orderId, reason);
  return cancelOrder(spec.orderId, spec.actor, reason);
}

export function OrderReasonAction({
  spec,
  triggerLabel,
  reasonLabel,
  reasonPlaceholder,
  confirmLabel,
  cancelLabel,
  errorLabel,
}: {
  spec: OrderReasonActionSpec;
  triggerLabel: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  confirmLabel: string;
  cancelLabel: string;
  errorLabel: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState(false);

  if (!expanded) {
    return (
      <Button variant="destructive" onClick={() => setExpanded(true)}>
        {triggerLabel}
      </Button>
    );
  }

  async function handleConfirm() {
    setPending(true);
    setError(false);
    const result = await runAction(spec, reason);
    setPending(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-label font-medium text-ink">{reasonLabel}</label>
      <Textarea
        value={reason}
        maxLength={500}
        placeholder={reasonPlaceholder}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="destructive" disabled={pending} onClick={handleConfirm}>
          {pending ? "…" : confirmLabel}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setExpanded(false)}>
          {cancelLabel}
        </Button>
      </div>
      {error && <p className="text-caption text-error">{errorLabel}</p>}
    </div>
  );
}
