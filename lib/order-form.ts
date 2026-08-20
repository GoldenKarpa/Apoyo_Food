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

// ── Accepting: the per-item pricing rule ────────────────────────────────────

/** The two ways naming prices at accept-time can be refused. */
export type AcceptPricingError = "priceRequired" | "priceInvalid";

export interface AcceptPricingItem {
  id: string;
  /** `null` for a QUOTE item — there is nothing to fall back to. */
  priceCentsSnapshot: number | null;
  quantity: number;
}

export type AcceptPricingResult<T extends AcceptPricingItem> =
  | {
      ok: true;
      /** Every item with its final price — what the order ends up costing. */
      resolved: (T & { priceCentsSnapshot: number })[];
      /** ONLY the items the seller actually typed a new price for. */
      changed: { id: string; priceCents: number }[];
      subtotalCents: number;
    }
  | { ok: false; error: AcceptPricingError };

/**
 * Architecture E5's "adjust quote-item prices → Accept (locks agreed price)",
 * as a pure decision with no I/O.
 *
 * The rule in full: a BLANK field is legal only when a snapshot already exists
 * (FIXED / STARTING_AT — still editable, for substitutions); a QUOTE item has
 * no snapshot, so leaving it blank is `priceRequired`; anything unparseable is
 * `priceInvalid`.
 *
 * ⚠ **Extracted at PD-S10 so the provider demo can call it instead of copying
 * it.** The demo renders the real `<AcceptOrderForm>` against an in-memory
 * sandbox, and the first version of that sandbox re-implemented this rule by
 * hand. It happened to be correct — but Apparel's own demo review found exactly
 * that pattern having silently drifted from the product it claimed to
 * reproduce, on the one screen a prospective seller judges the whole business
 * model by. A duplicate of a pricing rule is a bug waiting for the rule to
 * change; there is now one definition and both callers use it.
 *
 * ⚠ `changed` exists so `lib/actions/order.ts` keeps writing exactly the rows
 * it wrote before this extraction — items the seller left blank are not
 * re-written with their own unchanged value. `resolved` and `subtotalCents` are
 * what a caller with no database (the demo) needs instead.
 */
export function resolveAcceptPricing<T extends AcceptPricingItem>(
  items: T[],
  /** Reads the raw, untrimmed field for one item — a FormData lookup in both callers. */
  rawFor: (itemId: string) => string | null,
  parse: (raw: string) => number | null,
): AcceptPricingResult<T> {
  const resolved: (T & { priceCentsSnapshot: number })[] = [];
  const changed: { id: string; priceCents: number }[] = [];

  for (const item of items) {
    const raw = rawFor(item.id);
    const rawStr = raw === null ? "" : String(raw).trim();

    if (rawStr === "") {
      if (item.priceCentsSnapshot === null) return { ok: false, error: "priceRequired" };
      resolved.push(item as T & { priceCentsSnapshot: number });
      continue;
    }

    const cents = parse(rawStr);
    if (cents === null) return { ok: false, error: "priceInvalid" };
    resolved.push({ ...item, priceCentsSnapshot: cents });
    changed.push({ id: item.id, priceCents: cents });
  }

  const subtotalCents = resolved.reduce(
    (sum, item) => sum + item.priceCentsSnapshot * item.quantity,
    0,
  );
  return { ok: true, resolved, changed, subtotalCents };
}
