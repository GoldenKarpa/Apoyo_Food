import type { OrderStatus } from "@prisma/client";

/**
 * The order status machine (Slice 17, architecture E5) — a pure decision
 * function, no I/O, mirroring `lib/admin-sellers.ts`'s
 * `decideSellerLifecycleAction` shape exactly. That split is what let Slice
 * 16 catch a real bypass live (a transition reachable from the wrong starting
 * state); the same risk exists here — `cancel` is reachable from TWO starting
 * states and BOTH parties, which is exactly the kind of matrix a starting-
 * state check has to get right rather than a caller re-deriving it inline.
 *
 * `PENDING -> ACCEPTED -> COMPLETED`, four terminal alternatives (Part D):
 * `DECLINED | CANCELLED_BY_CUSTOMER | CANCELLED_BY_SELLER | EXPIRED`.
 */
export type OrderLifecycleAction = "accept" | "decline" | "complete" | "cancel" | "expire";
export type OrderActor = "seller" | "client" | "system";

/** Who may even ATTEMPT each action, before the starting-state check runs. */
const ACTOR_ALLOWED: Record<OrderLifecycleAction, OrderActor[]> = {
  accept: ["seller"],
  decline: ["seller"],
  complete: ["seller"],
  // Part E5 point 4: "either party before fulfillment". `expire` is
  // deliberately absent from `cancel`'s allowed actors — it is the SWEEP's own
  // action (`lib/sweep.ts`), never a user-initiated one.
  cancel: ["seller", "client"],
  expire: ["system"],
};

const VALID_FROM: Record<OrderLifecycleAction, OrderStatus[]> = {
  accept: ["PENDING"],
  decline: ["PENDING"],
  complete: ["ACCEPTED"],
  cancel: ["PENDING", "ACCEPTED"],
  expire: ["PENDING"],
};

export type OrderLifecycleResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; reason: "invalidActor" | "invalidTransition" };

/**
 * `cancel`'s target status depends on WHO cancelled (Part D's two distinct
 * terminal values) — the only action where the actor affects the OUTCOME, not
 * just whether the action is allowed at all.
 */
export function decideOrderTransition(
  order: { status: OrderStatus },
  action: OrderLifecycleAction,
  actor: OrderActor,
): OrderLifecycleResult {
  if (!ACTOR_ALLOWED[action].includes(actor)) return { ok: false, reason: "invalidActor" };
  if (!VALID_FROM[action].includes(order.status)) return { ok: false, reason: "invalidTransition" };

  const status: OrderStatus =
    action === "accept"
      ? "ACCEPTED"
      : action === "decline"
        ? "DECLINED"
        : action === "complete"
          ? "COMPLETED"
          : action === "expire"
            ? "EXPIRED"
            : actor === "seller"
              ? "CANCELLED_BY_SELLER"
              : "CANCELLED_BY_CUSTOMER";

  return { ok: true, status };
}
