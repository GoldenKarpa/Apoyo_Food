import type { FoodSeller, FoodSellerPhoto, SellerStatus } from "@prisma/client";

import { activationBlockers, type SetupStepKey } from "@/lib/seller-profile";
import { completionInputFor } from "@/lib/seller";

/**
 * The seller status machine (Slice 16) — `PENDING` → `ACTIVE`/`SUSPENDED`,
 * `SUSPENDED` → `ACTIVE` (reinstate). Food's `SellerStatus` has no separate
 * `APPROVED` value (unlike Apparel's), so "approve" and "reinstate" both land
 * on `ACTIVE` — but they are still two DISTINCT actions with two DISTINCT
 * valid starting states, checked here BEFORE anything else runs.
 *
 * ⚠ The starting-state check is the whole point. A `reinstate` reachable from
 * `PENDING` (or an `approve` reachable from `SUSPENDED`) would let a seller
 * skip whatever the OTHER transition's own preconditions enforce — exactly
 * the bypass Apparel's Slice 16 follow-up fix closed after finding it live.
 * `applySellerLifecycleAction` is the one place both the starting-state rule
 * and the approval precondition are enforced, so no caller can apply either
 * check in the wrong order or skip one.
 */
export type SellerLifecycleAction = "approve" | "suspend" | "reinstate";

const VALID_FROM: Record<SellerLifecycleAction, SellerStatus[]> = {
  approve: ["PENDING"],
  suspend: ["ACTIVE"],
  reinstate: ["SUSPENDED"],
};

const TARGET_STATUS: Record<SellerLifecycleAction, SellerStatus> = {
  approve: "ACTIVE",
  suspend: "SUSPENDED",
  reinstate: "ACTIVE",
};

export type SellerLifecycleResult =
  | { ok: true; status: SellerStatus }
  | { ok: false; reason: "invalidTransition" }
  | { ok: false; reason: "incompleteProfile"; blockers: SetupStepKey[] };

/**
 * Pure decision function — takes the seller row (with its gallery, for the
 * completion check) and the requested action, returns the outcome without
 * touching the database. Kept side-effect-free so `scripts/verify-admin.ts`
 * can exercise every transition combination directly.
 *
 * `approve`'s extra precondition mirrors `lib/seller-profile.ts`'s own
 * `activationBlockers` — the exact same "photo, bio, areas, fulfillment"
 * bar the dashboard already nudges a PENDING seller toward.
 *
 * ⚠ **Advisory, not a hard gate — corrected 2026-08-09.** This used to refuse
 * approval outright when blockers existed, with no way through. The user's
 * own explicit direction: an admin who decides to approve despite a missing
 * field should be able to, after one extra confirmation naming what's
 * missing — never permanently blocked. `force=true` (only ever set after the
 * caller has shown that confirmation — `components/admin/admin-action-button.tsx`)
 * skips this check entirely; the FIRST call (force=false, the normal case)
 * still returns the blocker list so the caller has something to show.
 */
export function decideSellerLifecycleAction(
  seller: FoodSeller & { photos: FoodSellerPhoto[] },
  action: SellerLifecycleAction,
  force = false,
): SellerLifecycleResult {
  if (!VALID_FROM[action].includes(seller.status)) {
    return { ok: false, reason: "invalidTransition" };
  }
  if (action === "approve" && !force) {
    const blockers = activationBlockers(completionInputFor(seller));
    if (blockers.length > 0) return { ok: false, reason: "incompleteProfile", blockers };
  }
  return { ok: true, status: TARGET_STATUS[action] };
}
