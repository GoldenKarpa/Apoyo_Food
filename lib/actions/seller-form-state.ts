/**
 * The shared result shape for every seller-facing Server Action.
 *
 * `error` is a message KEY, never a sentence. Two reasons, and both bite
 * otherwise: the seller surface defaults to `es` (i18n/request.ts), so an
 * English string returned from a server action would be the one untranslated
 * thing on the page; and the same failure has to read identically whether it
 * surfaces in the wizard, the profile editor or a retry.
 *
 * Kept in its own module because `"use server"` files may only export async
 * functions — a type exported from `onboard-seller.ts` would be a build error.
 */
export type SellerFormErrorKey =
  | "signedOut"
  | "noSeller"
  | "displayName"
  | "bio"
  | "areas"
  | "languages"
  | "specialties"
  | "fulfillment"
  | "slug"
  // Slice 14 — listing CRUD + the availability-window builder.
  | "title"
  | "description"
  | "kind"
  | "priceMode"
  | "price"
  | "feedsCount"
  | "categories"
  | "ingredientTags"
  | "occasionTag"
  | "noListing"
  | "windowType"
  | "windowDays"
  | "windowDates"
  | "windowDateOrder"
  | "windowLeadTime"
  | "windowNote"
  | "windowLimit"
  // Slice 15 — Fresh Today posting + the Menu shelf manager.
  | "photo"
  | "caption"
  | "linkedListing"
  | "noStory"
  | "noHighlight"
  | "highlightTitle"
  | "highlightLimit"
  | "unknown";

export type SellerFormState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; error: SellerFormErrorKey };

export const SELLER_FORM_IDLE: SellerFormState = { status: "idle" };
