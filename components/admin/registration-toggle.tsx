"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setRegistrationEnabled } from "@/lib/actions/admin";

/**
 * The registration-toggle control — until now `vertical_registration_config`'s
 * FOOD row could only be flipped by a hand-authored migration in the
 * Apoyo-Demia repo (see `20260802220000_enable_food_registration_config`).
 * Writes through `setFoodRegistrationEnabled` → portal-web's existing PATCH,
 * scoped so this app's service token can only ever flip its OWN row.
 * Ported from Apoyo-Apparel's own control (Slice 16) — same shape, same
 * reasoning.
 *
 * ⚠ Displayed state is local (`localEnabled`), seeded from the `enabled`
 * prop but updated directly from the action's own confirmed return value on
 * success — NOT solely by waiting for `router.refresh()` to re-derive it
 * from a fresh read. See `setRegistrationEnabled`'s own comment for why: the
 * read path goes through a cross-request in-memory cache this write busts,
 * and trusting a re-fetch to reflect that bust immediately is exactly the
 * kind of staleness this sidesteps.
 */
export function RegistrationToggle({
  enabled,
  labels,
}: {
  enabled: boolean;
  labels: { on: string; off: string; turnOn: string; turnOff: string; error: string };
}) {
  const router = useRouter();
  const [localEnabled, setLocalEnabled] = React.useState(enabled);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState(false);

  async function toggle() {
    setPending(true);
    setError(false);
    const result = await setRegistrationEnabled(!localEnabled);
    setPending(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    setLocalEnabled(result.enabled);
    router.refresh();
  }

  return (
    <div className="admin-card">
      <div className="admin-toggle-row">
        <span className={localEnabled ? "admin-badge admin-badge-on" : "admin-badge admin-badge-off"}>
          {localEnabled ? labels.on : labels.off}
        </span>
        <button
          type="button"
          className={localEnabled ? "admin-btn admin-btn-danger" : "admin-btn admin-btn-primary"}
          disabled={pending}
          onClick={toggle}
        >
          {pending ? "…" : localEnabled ? labels.turnOff : labels.turnOn}
        </button>
      </div>
      {error && (
        <p className="admin-muted" style={{ marginTop: "0.5rem", color: "#b3413a" }}>
          {labels.error}
        </p>
      )}
    </div>
  );
}
