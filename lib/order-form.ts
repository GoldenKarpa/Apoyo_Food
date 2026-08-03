import type { FulfillmentMode } from "@prisma/client";

/**
 * Order-request form constants and pure validators — the same split
 * `lib/listing-form.ts` established (pure rules here, session+Prisma reads in
 * `lib/order.ts` and `lib/actions/order.ts`). Kept dependency-free so
 * `scripts/verify-orders.ts` can exercise validation without a database.
 */

export const FULFILLMENT_MODES: FulfillmentMode[] = ["PICKUP", "SELLER_DELIVERY", "MEETUP"];
export function isFulfillmentMode(value: string): value is FulfillmentMode {
  return (FULFILLMENT_MODES as string[]).includes(value);
}

export const MIN_QUANTITY = 1;
/** A sanity ceiling — a home kitchen order, not a wholesale one. */
export const MAX_QUANTITY = 50;

export const MAX_ITEM_NOTE_LENGTH = 300;
/** ⚠ Free text ONLY, never an address field (architecture Part G). */
export const MAX_FULFILLMENT_AREA_LENGTH = 200;
export const MAX_CUSTOMER_NOTE_LENGTH = 500;

/** Auto-expiry deadline for a PENDING request (architecture E5, "default 24h"). */
export const RESPOND_BY_HOURS = 24;

export function isValidQuantity(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_QUANTITY && value <= MAX_QUANTITY;
}
