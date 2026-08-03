/**
 * The shared result shape for a BUYER-facing Server Action — `lib/actions/
 * seller-form-state.ts`'s sibling, kept as a SEPARATE type rather than one
 * shared union.
 *
 * The two surfaces default to different locales (`i18n/request.ts`: client
 * `en`, seller `es`), so their error keys read from different message
 * namespaces (`client.errors.*` vs `seller.errors.*`) — collapsing them into
 * one union would let a seller-only key leak into a buyer-facing switch
 * statement with no compile-time signal that its translation lives under the
 * wrong namespace. `<RequestOrderSheet>` (Slice 17) is the first buyer-facing
 * form this app has; this type is what a second one reuses instead of
 * inventing a third shape.
 */
export type ClientFormErrorKey =
  | "signedOut"
  | "orderingPaused"
  | "noListing"
  | "fulfillmentMode"
  | "quantity"
  | "invalidDate"
  | "past"
  | "outOfWindow"
  | "leadTime"
  | "rateLimited"
  | "unknown";

export type ClientFormState =
  | { status: "idle" }
  | { status: "ok"; orderId: string; orderNumber: string }
  | { status: "error"; error: ClientFormErrorKey; minLeadDays?: number };

export const CLIENT_FORM_IDLE: ClientFormState = { status: "idle" };
