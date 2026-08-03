import type { FoodSeller, FulfillmentMode } from "@prisma/client";

/**
 * The seller profile's completion model — the single source of truth for
 * "what is still missing", used by three surfaces that must never disagree:
 *
 *   - the guided setup wizard, to decide which step to RESUME at;
 *   - the `/food` dashboard, to render empty states that point at next actions;
 *   - the profile editor, to show what an approver will be looking for.
 *
 * Keeping it here rather than in any one of them is what makes
 * "skippable-and-resumable" (architecture F2: "never force completeness before
 * value") a property of the data rather than of a wizard's client state. Every
 * step writes to the `FoodSeller` row immediately, so progress is derived by
 * reading that row back — refresh the page, come back tomorrow on another
 * device, and the flow resumes exactly where it stopped, with nothing held in a
 * session or a cookie.
 *
 * ⚠ **Nothing in this module authorizes anything.** `required` marks what an
 * admin will expect before flipping a seller PENDING -> ACTIVE, and it is
 * advisory in this slice: Slice 16 owns the approval queue and the actual gate.
 * Surfacing the list now is what stops a seller reaching the queue with an
 * empty profile and no idea why they are waiting.
 */

export type SetupStepKey =
  | "photo"
  | "cover"
  | "bio"
  | "areas"
  | "languages"
  | "specialties"
  | "fulfillment"
  | "gallery";

/**
 * Architecture F2's own order, verbatim: "photo -> cover -> bio -> areas on the
 * Trinidad map -> languages -> specialties -> fulfillment modes". `gallery`
 * follows as the one step whose subject is a collection rather than a field;
 * it is last because a cook with no photos of past work is still a usable
 * profile, and because it is the only step that is worth returning to
 * repeatedly.
 */
export const SETUP_STEPS: SetupStepKey[] = [
  "photo",
  "cover",
  "bio",
  "areas",
  "languages",
  "specialties",
  "fulfillment",
  "gallery",
];

/**
 * What an approver will look for. Deliberately short:
 *  - `areas` because Part C's "1-3 service areas" is the product's entire
 *    location model, and a seller with none is invisible to area browse;
 *  - `fulfillment` because a seller offering no way to hand food over cannot
 *    transact at all;
 *  - `bio` and `photo` because they are the whole of what a buyer sees before
 *    trusting a stranger's home kitchen.
 * Everything else genuinely is optional.
 */
const REQUIRED_STEPS = new Set<SetupStepKey>(["photo", "bio", "areas", "fulfillment"]);

export interface SellerProfileForCompletion {
  bio: string | null;
  profileImageThumb: string | null;
  coverImageThumb: string | null;
  areas: FoodSeller["areas"];
  languages: string[];
  specialties: string[];
  fulfillmentModes: FulfillmentMode[];
  /** Gallery size. Passed in rather than counted here — this module does no I/O. */
  photoCount: number;
}

export interface SetupStepStatus {
  key: SetupStepKey;
  done: boolean;
  /** Advisory only — see the module note. Slice 16 owns the real gate. */
  required: boolean;
}

/** Minimum bio length treated as "written" rather than "started". */
export const MIN_BIO_LENGTH = 20;

export function isStepDone(seller: SellerProfileForCompletion, step: SetupStepKey): boolean {
  switch (step) {
    case "photo":
      return seller.profileImageThumb !== null;
    case "cover":
      return seller.coverImageThumb !== null;
    case "bio":
      return (seller.bio ?? "").trim().length >= MIN_BIO_LENGTH;
    case "areas":
      return seller.areas.length > 0;
    case "languages":
      return seller.languages.length > 0;
    case "specialties":
      return seller.specialties.length > 0;
    case "fulfillment":
      return seller.fulfillmentModes.length > 0;
    case "gallery":
      return seller.photoCount > 0;
  }
}

export function setupStatus(seller: SellerProfileForCompletion): SetupStepStatus[] {
  return SETUP_STEPS.map((key) => ({
    key,
    done: isStepDone(seller, key),
    required: REQUIRED_STEPS.has(key),
  }));
}

/**
 * Where the wizard resumes: the first step that is not done, in F2's order.
 * `null` once everything is complete — the wizard then shows its summary rather
 * than looping back to step one.
 */
export function nextIncompleteStep(seller: SellerProfileForCompletion): SetupStepKey | null {
  return SETUP_STEPS.find((key) => !isStepDone(seller, key)) ?? null;
}

/** The required steps still outstanding — what the dashboard nudges toward. */
export function activationBlockers(seller: SellerProfileForCompletion): SetupStepKey[] {
  return SETUP_STEPS.filter((key) => REQUIRED_STEPS.has(key) && !isStepDone(seller, key));
}

/** 0-100, over ALL steps (not just required ones) — it is a progress bar, not a gate. */
export function completionPercent(seller: SellerProfileForCompletion): number {
  const done = SETUP_STEPS.filter((key) => isStepDone(seller, key)).length;
  return Math.round((done / SETUP_STEPS.length) * 100);
}

export function isSetupStepKey(value: string | null | undefined): value is SetupStepKey {
  return !!value && (SETUP_STEPS as string[]).includes(value);
}

/**
 * The languages a seller can declare. Two, because the product is two: Part F3
 * calls bilingualism "brand, not a hidden setting", and every string in the app
 * exists in exactly these two catalogues. Stored as plain strings (Part D has no
 * enum here) so a third can be added without a migration.
 */
export const SELLER_LANGUAGES = ["es", "en"] as const;
export type SellerLanguage = (typeof SELLER_LANGUAGES)[number];

export function isSellerLanguage(value: string): value is SellerLanguage {
  return (SELLER_LANGUAGES as readonly string[]).includes(value);
}

/** Part D's `FulfillmentMode`, in the order the setup step offers them. */
export const FULFILLMENT_MODES: FulfillmentMode[] = ["PICKUP", "SELLER_DELIVERY", "MEETUP"];

export function isFulfillmentMode(value: string): value is FulfillmentMode {
  return (FULFILLMENT_MODES as string[]).includes(value);
}

/** Part C: a seller declares 1-3 service areas. The DB enforces the upper bound. */
export const MAX_SELLER_AREAS = 3;

/** Keeps a specialties list a *list* rather than a second bio. */
export const MAX_SPECIALTIES = 8;
export const MAX_SPECIALTY_LENGTH = 40;
export const MAX_BIO_LENGTH = 600;
export const MAX_DISPLAY_NAME_LENGTH = 60;
export const MIN_DISPLAY_NAME_LENGTH = 2;

/** Part G's gallery cap — a profile, not a photo host. */
export const MAX_GALLERY_PHOTOS = 12;
