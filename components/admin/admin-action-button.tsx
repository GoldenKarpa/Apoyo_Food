"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  resolveReport,
  takedownListing,
  updateSellerStatus,
  setOrderingEnabled,
  type ReportResolution,
  type SellerAction,
} from "@/lib/actions/admin";

/**
 * ⚠ Takes a plain serializable `spec`, NOT a closure over a Server Action
 * (`() => updateSellerStatus(id, "approve")`). A Server Component can only
 * hand a Client Component either a bare Server Action reference or plain
 * data — a hand-rolled arrow function wrapping one is an ordinary client
 * function as far as React's RSC serializer is concerned, and it rejects it
 * ("Functions cannot be passed directly to Client Components…"), which is
 * exactly the bug Apparel's own version of this component found and fixed.
 * This component imports every admin action itself and calls the right one
 * from `spec`.
 */
export type AdminActionSpec =
  | { kind: "seller"; sellerId: string; sellerAction: SellerAction }
  | { kind: "report"; reportId: string; resolution: ReportResolution }
  | { kind: "takedown"; listingId: string }
  | { kind: "ordering"; enabled: boolean };

async function runAction(spec: AdminActionSpec, force = false): Promise<{ ok: boolean; reason?: string; blockers?: string[] }> {
  if (spec.kind === "seller") return updateSellerStatus(spec.sellerId, spec.sellerAction, force);
  if (spec.kind === "report") return resolveReport(spec.reportId, spec.resolution);
  if (spec.kind === "ordering") return setOrderingEnabled(spec.enabled);
  return takedownListing(spec.listingId);
}

export function AdminActionButton({
  label,
  variant = "default",
  confirmMessage,
  errorLabel,
  reasonLabels,
  incompleteProfileConfirm,
  spec,
}: {
  label: string;
  variant?: "default" | "primary" | "danger";
  /** A plain `window.confirm` — disruptive actions only (suspend, takedown). */
  confirmMessage?: string;
  errorLabel: string;
  /**
   * Overrides `errorLabel` for a specific failure `reason`. Falls back to
   * `errorLabel` for any reason not listed here.
   */
  reasonLabels?: Record<string, string>;
  /**
   * Seller-approve only. `updateSellerStatus`'s `"incompleteProfile"` reason
   * is NOT a dead end (corrected 2026-08-09, the user's own explicit
   * direction: an admin who decides to approve anyway must be able to, not
   * be permanently blocked) — it's a confirmation naming what's missing. On
   * confirm, this button retries the SAME action with `force: true`, which
   * skips the completeness check. `template`'s `{fields}` placeholder is
   * replaced with the already-translated, comma-joined blocker list (built
   * from `labels`, keyed by `lib/seller-profile.ts`'s `SetupStepKey`).
   */
  incompleteProfileConfirm?: { template: string; labels: Record<string, string> };
  spec: AdminActionSpec;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function handleClick(force = false) {
    if (!force && confirmMessage && !window.confirm(confirmMessage)) return;
    setPending(true);
    setErrorMessage(null);
    const result = await runAction(spec, force);
    setPending(false);

    if (result.ok) {
      router.refresh();
      return;
    }

    if (!force && result.reason === "incompleteProfile" && result.blockers && incompleteProfileConfirm) {
      const fields = result.blockers.map((key) => incompleteProfileConfirm.labels[key] ?? key).join(", ");
      const message = incompleteProfileConfirm.template.replace("{fields}", fields);
      if (window.confirm(message)) {
        await handleClick(true);
      }
      return;
    }

    setErrorMessage((result.reason && reasonLabels?.[result.reason]) || errorLabel);
  }

  const className =
    variant === "primary" ? "admin-btn admin-btn-primary" : variant === "danger" ? "admin-btn admin-btn-danger" : "admin-btn";

  return (
    <span>
      <button type="button" className={className} disabled={pending} onClick={() => handleClick()}>
        {pending ? "…" : label}
      </button>
      {errorMessage && (
        <span className="admin-muted" style={{ display: "block", marginTop: "0.25rem", color: "#b3413a" }}>
          {errorMessage}
        </span>
      )}
    </span>
  );
}
