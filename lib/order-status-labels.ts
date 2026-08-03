import type { OrderStatus } from "@prisma/client";

import type { StatusTone } from "@/components/ui/chip";

/**
 * Maps the seven `OrderStatus` values onto `<StatusChip>`'s four Part F3
 * tones (`components/ui/chip.tsx`: "Pending = gold-vivid fill + ink, Accepted
 * = green, Declined = error, Completed = muted" — fixed there since Slice 1
 * so this slice inherits them rather than re-deciding under deadline).
 *
 * Part F3 only names four states; the other three terminal values get a
 * considered placement rather than a new tone:
 *  - `EXPIRED` -> `declined`. From the customer's own vantage the outcome is
 *    identical to a decline — the request did not proceed — even though
 *    nobody actively said no.
 *  - `CANCELLED_BY_CUSTOMER` / `CANCELLED_BY_SELLER` -> `completed`
 *    (Part F3's "muted" neutral tone). A cancellation is a deliberate
 *    withdrawal AFTER some commitment, not a rejection — visually closer to
 *    "this is over" than to "this was refused".
 */
export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  COMPLETED: "completed",
  DECLINED: "declined",
  EXPIRED: "declined",
  CANCELLED_BY_CUSTOMER: "completed",
  CANCELLED_BY_SELLER: "completed",
};
