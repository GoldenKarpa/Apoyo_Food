import { cache } from "react";
import type { FoodSeller, FoodSellerPhoto } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFoodSession, type FoodSession } from "@/lib/session";
import {
  activationBlockers,
  completionPercent,
  nextIncompleteStep,
  setupStatus,
  type SellerProfileForCompletion,
  type SetupStepKey,
  type SetupStepStatus,
} from "@/lib/seller-profile";

/**
 * The seller workspace's read side — one query pair serving the dashboard, the
 * profile editor and the setup wizard, so those three surfaces can never
 * disagree about what a seller has done.
 *
 * ⚠ Deliberately NOT `requireFoodSeller`. That guard demands an ACTIVE row AND
 * an ACTIVE `(FOOD, PROVIDER)` membership, and this slice's whole job is to
 * render the states it excludes: signed-out, signed-in-with-no-seller-row,
 * PENDING and SUSPENDED. Slice 3 split `resolveFoodSeller` out for exactly this
 * moment. Owning the row is what proves "this is my workspace"; membership
 * proves standing, and standing is what the *marketplace* checks, not the
 * dashboard.
 */

export type WorkspaceState =
  /** No session cookie at all — render the signed-out notice, never a redirect. */
  | "signed-out"
  /** Signed in, no `FoodSeller` row — the become-a-seller entry point. */
  | "no-seller"
  /** Row exists, awaiting Slice 16's approval queue. */
  | "pending"
  | "active"
  | "suspended";

export interface SellerWorkspace {
  state: WorkspaceState;
  session: FoodSession | null;
  seller: (FoodSeller & { photos: FoodSellerPhoto[] }) | null;
  /** Per-step completion, resume target and the outstanding required steps. */
  steps: SetupStepStatus[];
  nextStep: SetupStepKey | null;
  blockers: SetupStepKey[];
  percent: number;
}

function emptyProgress(): Pick<SellerWorkspace, "steps" | "nextStep" | "blockers" | "percent"> {
  return { steps: [], nextStep: null, blockers: [], percent: 0 };
}

export function completionInputFor(
  seller: FoodSeller & { photos: FoodSellerPhoto[] },
): SellerProfileForCompletion {
  return {
    bio: seller.bio,
    profileImageThumb: seller.profileImageThumb,
    coverImageThumb: seller.coverImageThumb,
    areas: seller.areas,
    languages: seller.languages,
    specialties: seller.specialties,
    fulfillmentModes: seller.fulfillmentModes,
    photoCount: seller.photos.length,
  };
}

/**
 * ⚠ Wrapped in React's `cache()`, which `lib/ecosystem.ts`'s `getMemberships`
 * explicitly must NOT be — the difference matters and is worth stating.
 * `cache()` memoizes per REQUEST and cannot be invalidated from inside that
 * request, which broke membership reads (mint, then re-read, still stale). This
 * function reads only the local session and the local `FoodSeller` row, and
 * nothing in a single render mutates either: mutations happen in Server
 * Actions, which `revalidatePath` turns into a NEW request. So the memo is a
 * plain deduplication between the dashboard layout and the page beneath it,
 * with no correctness edge.
 */
export const loadSellerWorkspace = cache(async function loadSellerWorkspace(): Promise<SellerWorkspace> {
  const session = await getFoodSession();
  if (!session) {
    return { state: "signed-out", session: null, seller: null, ...emptyProgress() };
  }

  const seller = await prisma.foodSeller.findUnique({
    where: { userId: session.userId },
    include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });

  if (!seller) {
    return { state: "no-seller", session, seller: null, ...emptyProgress() };
  }

  const input = completionInputFor(seller);
  return {
    state:
      seller.status === "ACTIVE" ? "active" : seller.status === "SUSPENDED" ? "suspended" : "pending",
    session,
    seller,
    steps: setupStatus(input),
    nextStep: nextIncompleteStep(input),
    blockers: activationBlockers(input),
    percent: completionPercent(input),
  };
});

/**
 * The ownership check every seller-owned mutation runs first.
 *
 * ⚠ This is the per-resource authorization Slice 4 explicitly deferred: the
 * shared `/api/media/upload` route guarantees only that an upload is
 * *authenticated*, because when it was written there were no seller-owned
 * resources to own. There are now, and every write in this slice resolves the
 * seller FROM THE SESSION rather than trusting an id in the request body —
 * which is what makes "edit someone else's kitchen" not an available request
 * shape rather than a check that could be forgotten.
 */
export async function requireOwnSeller(): Promise<{ session: FoodSession; seller: FoodSeller } | null> {
  const session = await getFoodSession();
  if (!session) return null;
  const seller = await prisma.foodSeller.findUnique({ where: { userId: session.userId } });
  if (!seller) return null;
  return { session, seller };
}
